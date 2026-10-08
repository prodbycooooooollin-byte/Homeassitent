"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HeroPortrait, HeroBackdrop, RankEmblem, useHero, useHeroName } from "./GameAssets";
import { GradeBadge, GRADE_STYLE } from "./GradeBadge";
import { Icon } from "./Icon";
import { NavLink } from "./NavLink";
import { buildDebrief, type DebriefRow } from "@/lib/debrief";
import { subOf } from "@/lib/grade";
import { fmtDuration } from "@/lib/format";
import { formatBadge } from "@/lib/ranks";
import type { Grade, MatchDetails, Rating } from "@/lib/types";

export interface DebriefRequest { matchId: number; account: number; test?: boolean }
export const DEBRIEF_EVENT = "dl-debrief";
/** Öffnet den Debrief (aus beliebiger Stelle der App). */
export const openDebrief = (r: DebriefRequest) => window.dispatchEvent(new CustomEvent<DebriefRequest>(DEBRIEF_EVENT, { detail: r }));

interface Res { details: MatchDetails | null; ratings: Record<number, Rating | null>; lobbyBadge: number | null }

const PLACE = ["#f0b44c", "#c4ccda", "#cd7f32"];
const GRADES: Grade[] = ["F", "D", "C", "B", "A", "S"];

/** Vollbild-Debrief nach einem Match: Ergebnis, Note mit Skala, Platzierungen, stärkste/schwächste Seite und eine kurze Analyse. */
export function DebriefHost() {
  const [req, setReq] = useState<DebriefRequest | null>(null);
  useEffect(() => {
    const on = (e: Event) => setReq((e as CustomEvent<DebriefRequest>).detail);
    window.addEventListener(DEBRIEF_EVENT, on);
    // Direktaufruf zum Testen: ?debrief=<Match-ID>&account=<ID>
    const q = new URLSearchParams(window.location.search);
    if (q.get("debrief") && q.get("account")) setReq({ matchId: Number(q.get("debrief")), account: Number(q.get("account")), test: true });
    return () => window.removeEventListener(DEBRIEF_EVENT, on);
  }, []);
  const close = useCallback(() => setReq(null), []);
  useEffect(() => {
    if (!req) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [req, close]);
  if (!req) return null;
  return <Overlay key={req.matchId + (req.test ? "t" : "")} req={req} onClose={close} />;
}

function Overlay({ req, onClose }: { req: DebriefRequest; onClose: () => void }) {
  const [res, setRes] = useState<Res | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await (await fetch(`/api/matches/${req.matchId}?account=${req.account}`)).json();
        if (!alive) return;
        setRes(r);
        if (!r.details && tries < 60) setTimeout(() => alive && setTries((t) => t + 1), 6000);
      } catch { if (alive && tries < 60) setTimeout(() => alive && setTries((t) => t + 1), 6000); }
    };
    load();
    return () => { alive = false; };
  }, [req.matchId, req.account, tries]);

  const d = res?.details ?? null;
  const me = d?.players.find((p) => p.accountId === req.account) ?? null;
  const rating = res?.ratings?.[req.account] ?? null;
  const db = useMemo(() => (d && me ? buildDebrief(d, me, rating) : null), [d, me, rating]);
  const won = !!(d && me && d.winningTeam === me.team);
  const draw = !!d && d.winningTeam === null;
  const accent = draw ? "#8b94a8" : won ? "#3ecf8e" : "#f0616d";
  const heroName = useHeroName();
  const { color } = useHero(me?.heroId);

  return (
    <div className="debrief fixed inset-0 z-[120] overflow-y-auto bg-[#05060a]/95 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Match-Debrief">
      <div className="pointer-events-none fixed inset-0 opacity-60" style={{ background: `radial-gradient(900px 500px at 80% 30%, ${color}33, transparent 70%), radial-gradient(700px 400px at 10% 0%, ${accent}22, transparent 70%)` }} />
      {me && <HeroBackdrop id={me.heroId} className="debrief-art !fixed" />}
      <div className="relative mx-auto flex min-h-full max-w-[1400px] flex-col px-8 pb-10 pt-8">
        <div className="flex items-start gap-4">
          <div className="min-w-0">
            <h1 className="debrief-title display text-6xl font-extrabold uppercase tracking-[0.12em]" style={{ color: accent, textShadow: `0 0 40px ${accent}66` }}>{!d ? "Auswertung" : draw ? "Unentschieden" : won ? "Sieg" : "Niederlage"}</h1>
            {d && me && <div className="debrief-fade mt-1 flex flex-wrap items-center gap-x-3 text-sm uppercase tracking-widest text-muted" style={{ ["--d" as string]: "0.35s" }}><b className="text-white">{heroName(me.heroId)}</b><span>/ {fmtDuration(d.durationS)}</span>{d.matchMode && <span>/ {d.matchMode}</span>}{req.test && <span className="rounded bg-amber/20 px-2 py-0.5 text-[10px] font-bold text-amber">Testansicht</span>}</div>}
          </div>
          <div className="ml-auto flex gap-2">
            {d && <NavLink href={`/match/${req.matchId}?account=${req.account}`} onClick={onClose} className="btn btn-gold">Zum Match</NavLink>}
            <button onClick={onClose} className="btn btn-ghost">Schließen</button>
          </div>
        </div>

        {d && !me ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="display text-xl font-bold">Dich in diesem Match nicht gefunden</div>
            <p className="max-w-md text-sm text-muted">Die Match-Details enthalten keinen Spieler mit deiner Account-ID und keinen eindeutig passenden Eintrag (Held, Team, K/D/A). Öffne das Match, um alle Spieler zu sehen.</p>
          </div>
        ) : !d || !me || !db ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-amber" />
            <div className="display text-xl font-bold">Match-Daten werden vorbereitet …</div>
            <p className="max-w-md text-sm text-muted">Valve und die Deadlock-API liefern die Details meist wenige Minuten nach dem Ende. Dieses Fenster aktualisiert sich selbst.</p>
          </div>
        ) : (
          <div className="mt-8 grid flex-1 gap-10 lg:grid-cols-[minmax(380px,520px)_1fr]">
            <div>
              <div className="debrief-fade mb-2 grid grid-cols-[1fr_64px_64px] px-1 text-[10px] font-semibold uppercase tracking-widest text-muted" style={{ ["--d" as string]: "0.45s" }}><span /><span className="text-center">Team</span><span className="text-center">Lobby</span></div>
              <div className="space-y-1.5">{db.rows.map((r, i) => <Row key={r.label} r={r} i={i} />)}</div>
            </div>

            <div className="relative flex flex-col items-center lg:items-start">
              <div className="lg:ml-12"><Gauge rating={rating} /></div>
              <p className="debrief-fade mt-4 max-w-md text-center text-base text-white/90 lg:ml-12 lg:text-left" style={{ ["--d" as string]: "1.5s" }}>{db.verdict}</p>
            </div>

            <div className="grid items-start gap-4 lg:col-span-2 lg:grid-cols-3">
              <Side title="Deine stärkste Seite" tone="#3ecf8e" icon="trendUp" item={db.best} delay={1.7} />
              <Side title="Deine schwächste Seite" tone="#f0616d" icon="trendDown" item={db.worst} delay={1.85} />
              <div className="debrief-fade rounded-2xl border border-white/10 bg-white/[0.04] p-4" style={{ ["--d" as string]: "2s" }}>
                <div className="label mb-2 flex items-center gap-1.5"><Icon name="eye" size={13} />Analyse</div>
                <ul className="space-y-1.5 text-sm">
                  {db.good.map((t, i) => <li key={"g" + i} className="flex gap-2"><Icon name="check" size={14} className="mt-0.5 shrink-0 text-[#3ecf8e]" /><span>{t}</span></li>)}
                  {db.bad.map((t, i) => <li key={"b" + i} className="flex gap-2"><Icon name="x" size={14} className="mt-0.5 shrink-0 text-[#f0616d]" /><span>{t}</span></li>)}
                  {!db.good.length && !db.bad.length && <li className="text-muted">Keine auffälligen Stärken oder Schwächen.</li>}
                </ul>
              </div>
            </div>
            {me.badge && <div className="debrief-fade flex items-center gap-3 lg:col-span-2" style={{ ["--d" as string]: "2.2s" }}><RankEmblem badge={me.badge} size={36} /><span className="text-sm text-muted">Rang im Match: <b className="text-white">{formatBadge(me.badge)}</b>{res?.lobbyBadge ? <> · Lobby-Ø <b className="text-white">{formatBadge(res.lobbyBadge)}</b></> : null}</span></div>}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ r, i }: { r: DebriefRow; i: number }) {
  const chip = (place: number, of: number) => (
    <span className="mx-auto flex h-7 w-12 items-center justify-center rounded-md text-[12px] font-extrabold" style={{ background: place <= 3 ? PLACE[place - 1] : "rgba(255,255,255,.08)", color: place <= 3 ? "#1a1204" : "#c7cdd9" }} title={`Platz ${place} von ${of}`}>{place}.</span>
  );
  return (
    <div className="debrief-row grid grid-cols-[1fr_64px_64px] items-center rounded-lg border-b border-white/[0.06] px-1 py-1.5" style={{ ["--d" as string]: `${0.5 + i * 0.12}s` }}>
      <div className="flex items-baseline justify-between pr-6"><span className="text-[13px] font-semibold uppercase tracking-widest text-muted">{r.label}</span><span className="display num text-2xl font-extrabold">{r.value}</span></div>
      {chip(r.team, r.teamSize)}{chip(r.lobby, r.lobbySize)}
    </div>
  );
}

function Side({ title, tone, icon, item, delay }: { title: string; tone: string; icon: "trendUp" | "trendDown"; item: { label: string; score: number; detail: string } | null; delay: number }) {
  return (
    <div className="debrief-fade rounded-2xl border p-4" style={{ borderColor: `${tone}55`, background: `${tone}0d`, ["--d" as string]: `${delay}s` }}>
      <div className="label mb-1.5 flex items-center gap-1.5" style={{ color: tone }}><Icon name={icon} size={13} />{title}</div>
      {item ? <><div className="display text-2xl font-extrabold">{item.label}</div><div className="num text-sm font-bold" style={{ color: tone }}>Score {item.score.toFixed(2)}</div><p className="mt-1 text-xs leading-snug text-muted">{item.detail}</p></> : <p className="text-sm text-muted">Nicht bewertbar.</p>}
    </div>
  );
}

/** Notenring wie im Spiel: Segmente F bis S, gefüllt bis zur erreichten Note, große Note in der Mitte. */
function Gauge({ rating }: { rating: Rating | null }) {
  const R = 118, C = 2 * Math.PI * R;
  const score = rating?.score ?? 0;
  const f = Math.max(0, Math.min(1, (score - 0.4) / 1.2));
  const grade = rating?.grade ?? null;
  const seg = C / GRADES.length;
  return (
    <div className="relative h-[300px] w-[300px]">
      <svg viewBox="0 0 300 300" className="absolute inset-0 -rotate-90">
        {GRADES.map((g, i) => <circle key={g} cx="150" cy="150" r={R} fill="none" stroke={GRADE_STYLE[g].glow.replace(/,[^,]*\)$/, ",.22)")} strokeWidth="14" strokeDasharray={`${seg - 6} ${C - seg + 6}`} strokeDashoffset={-i * seg} />)}
        <circle cx="150" cy="150" r={R} fill="none" stroke={grade ? GRADE_STYLE[grade].glow.replace(/,[^,]*\)$/, ",1)") : "#8b94a8"} strokeWidth="14" strokeLinecap="round" strokeDasharray={C} className="debrief-ring" style={{ ["--c" as string]: C, ["--o" as string]: C * (1 - f) }} />
      </svg>
      {GRADES.map((g, i) => { const a = ((i + 0.5) / GRADES.length) * 2 * Math.PI - Math.PI / 2; return <span key={g} className="absolute text-xs font-bold text-muted" style={{ left: 150 + Math.cos(a) * 146 - 6, top: 150 + Math.sin(a) * 146 - 8 }}>{g}</span>; })}
      <div className="debrief-grade absolute inset-0 flex flex-col items-center justify-center">
        {grade ? <GradeBadge grade={grade} size="xl" sub={subOf(rating?.label)} /> : <div className="display text-6xl font-extrabold text-muted">–</div>}
        <div className="display num mt-3 text-3xl font-extrabold">{rating ? rating.score.toFixed(2) : "0.0"}</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted">Match-Note</div>
      </div>
    </div>
  );
}
