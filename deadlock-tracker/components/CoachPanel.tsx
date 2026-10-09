"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { advise, detectEvents, type Call, type CoachCtx, type CoachEvent, type CoachSnap } from "@/lib/coach";
import { gamePlan } from "@/lib/live";
import type { ScoutResult } from "@/lib/scout";
import type { LiveMatchMeta } from "./ScoutBoard";

const URG: Record<Call["urgency"], { c: string; label: string }> = { now: { c: "#f0616d", label: "Jetzt" }, soon: { c: "#f0b44c", label: "Bald" }, info: { c: "#4aa3ff", label: "Hinweis" } };
const TONE = { good: "#3ecf8e", bad: "#f0616d", info: "#8fb4ff" } as const;

/** Live-Coach: sammelt Schnappschüsse des laufenden Matches und leitet Empfehlungen und Ereignisse ab. */
export function useCoach(r: ScoutResult, match: LiveMatchMeta | undefined, live: boolean) {
  const hist = useRef<CoachSnap[]>([]);
  const matchId = useRef<number | null>(null);
  const [events, setEvents] = useState<CoachEvent[]>([]);
  const [swap, setSwap] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => { try { setSwap(localStorage.getItem("dl.objSwap") === "1"); } catch { /* egal */ } }, []);
  const toggleSwap = () => setSwap((s) => { try { localStorage.setItem("dl.objSwap", s ? "0" : "1"); } catch { /* egal */ } return !s; });

  const en = r.myTeam === 0 ? 1 : 0;
  const ob = match?.objectives, nw = match?.netWorth;
  const snap: CoachSnap | null = live && match?.durationS !== undefined ? {
    t: match.durationS,
    diff: nw ? nw[r.myTeam] - nw[en] : null,
    // Annahme: die Maske eines Teams zählt dessen bereits zerstörte Gebäude (umschaltbar, falls die API anders zählt)
    objMine: ob ? ob[swap ? en : r.myTeam] : null,
    objEnemy: ob ? ob[swap ? r.myTeam : en] : null,
  } : null;

  useEffect(() => {
    if (!snap) return;
    if (match && matchId.current !== match.id) { matchId.current = match.id; hist.current = []; setEvents([]); }
    const prev = hist.current[hist.current.length - 1] ?? null;
    if (prev && snap.t <= prev.t) return;
    hist.current = [...hist.current.slice(-80), snap];
    const ev = detectEvents(prev, snap);
    if (ev.length) setEvents((e) => { const ids = new Set(e.map((x) => x.id)); return [...ev.filter((x) => !ids.has(x.id)), ...e].slice(0, 12); });
    setTick((x) => x + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap?.t, snap?.diff, snap?.objMine, snap?.objEnemy, match?.id]);

  const ctx = useMemo<CoachCtx>(() => {
    const plan = gamePlan(r.players, r.myTeam);
    const enemies = r.players.filter((p) => p.team !== r.myTeam);
    const smurf = enemies.find((p) => p.tags.some((t) => t.key === "smurf"));
    return { threat: plan.threat?.name ?? undefined, aggroEnemies: enemies.filter((p) => p.tags.some((t) => t.key === "aggressive")).length, smurfEnemy: smurf?.name };
  }, [r]);
  const out = useMemo(() => advise(hist.current, ctx), [tick, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...out, events, swap, toggleSwap, active: !!snap };
}

/** Rechte Spalte der Live-Seite: aktuelle Ansage, weitere Hinweise, Ereignisprotokoll. */
export function CoachPanel({ coach }: { coach: ReturnType<typeof useCoach> }) {
  const u = URG[coach.main.urgency];
  return (
    <aside className="flex h-full min-h-0 flex-col gap-2">
      <section className="surface relative overflow-hidden p-4" style={{ borderColor: `${u.c}66`, boxShadow: `0 0 40px -20px ${u.c}` }}>
        <div className="mb-2 flex items-center gap-2"><Icon name="bolt" size={14} /><span className="label !text-[10px]">Coach</span><span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: u.c, background: `${u.c}22` }}>{u.label}</span></div>
        <div className="flex gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${u.c}22`, color: u.c }}><Icon name={coach.main.icon as IconName} size={22} /></span>
          <div><div className="display text-lg font-extrabold leading-tight">{coach.main.title}</div><p className="mt-1 text-xs leading-relaxed text-muted">{coach.main.why}</p></div>
        </div>
      </section>
      {coach.others.length > 0 && (
        <section className="surface space-y-2 p-3">
          {coach.others.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <span className="mt-0.5 shrink-0" style={{ color: URG[c.urgency].c }}><Icon name={c.icon as IconName} size={15} /></span>
              <div><div className="text-sm font-semibold leading-tight">{c.title}</div><div className="text-[11px] leading-snug text-muted">{c.why}</div></div>
            </div>
          ))}
        </section>
      )}
      <section className="surface flex min-h-0 flex-1 flex-col p-3">
        <div className="label mb-1.5 !text-[10px]">Ereignisse</div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-hidden">
          {coach.events.length === 0 && <p className="text-xs text-muted">Noch nichts passiert. Gebäude, Führungswechsel und große Kämpfe erscheinen hier.</p>}
          {coach.events.map((e) => <div key={e.id} className="flex gap-2 text-xs"><span style={{ color: TONE[e.tone] }} className="mt-0.5 shrink-0"><Icon name={e.icon as IconName} size={13} /></span><span>{e.text}</span></div>)}
        </div>
        <button onClick={coach.toggleSwap} className="mt-2 text-left text-[10px] text-muted underline decoration-dotted hover:text-white" title="Falls die Seite Objectives gegenüber dem Spiel vertauscht zuordnet">Objectives vertauscht? {coach.swap ? "(umgeschaltet)" : ""}</button>
        <p className="mt-1 text-[10px] leading-snug text-muted">Der Coach kennt weder Positionen noch Cooldowns – er schließt nur aus Zeit, Souls und Gebäuden. Er kann danebenliegen.</p>
      </section>
    </aside>
  );
}
