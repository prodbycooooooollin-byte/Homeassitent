"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAssets } from "./GameAssets";
import { Icon } from "./Icon";
import { ScoutBoard, type LiveMatchMeta } from "./ScoutBoard";
import type { ScoutResult } from "@/lib/scout";

const KEY = "dl.bot";
interface Cfg { hero: number; mates: number[]; enemies: number[] }
const EMPTY: Cfg = { hero: 0, mates: [0, 0, 0, 0, 0], enemies: [0, 0, 0, 0, 0, 0] };
const SYNC_MS = 8000;

/**
 * Testmodus für Bot-Matches: Bot- und Übungsmatches tauchen in den Live-Daten nicht auf. Hier gibst du die Helden von Hand an,
 * die Uhr läuft lokal, Souls-Vorsprung und Objectives stellst du per Knopf nach – Scouting und Coach arbeiten wie im echten Live-Match.
 */
export function BotMatch({ account }: { account: number }) {
  const { bundle } = useAssets();
  const heroes = useMemo(() => Object.values(bundle.heroes).filter((h) => h.playable).sort((a, b) => a.name.localeCompare(b.name, "de")), [bundle]);
  const [cfg, setCfg] = useState<Cfg>(EMPTY);
  useEffect(() => { try { const c = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (c && typeof c.hero === "number") setCfg({ ...EMPTY, ...c }); } catch { /* egal */ } }, []);
  const save = (c: Cfg) => { setCfg(c); try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* egal */ } };

  const [res, setRes] = useState<ScoutResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [startMin, setStartMin] = useState(0);
  const [run, setRun] = useState<{ t0: number; offset: number } | null>(null);
  const [diff, setDiff] = useState(0);
  const [obj, setObj] = useState<[number, number]>([0, 0]);
  const [now, setNow] = useState(Date.now());
  const [meta, setMeta] = useState<LiveMatchMeta | undefined>();
  const id = useRef(-Date.now());

  const elapsed = useCallback(() => (run ? run.offset + Math.floor((Date.now() - run.t0) / 1000) : 0), [run]);
  const commit = useCallback((d: number, o: [number, number]) => {
    if (!run) return;
    const t = elapsed();
    const base = 8000 + t * 560;
    setMeta({ id: id.current, durationS: t, mode: "Bot-Match", netWorth: [Math.round(base + d / 2), Math.round(base - d / 2)], objectives: o });
  }, [run, elapsed]);
  useEffect(() => { if (run) commit(diff, obj); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [run]);
  useEffect(() => {
    if (!run) return;
    const a = setInterval(() => setNow(Date.now()), 1000);
    const b = setInterval(() => commit(diff, obj), SYNC_MS);
    return () => { clearInterval(a); clearInterval(b); };
  }, [run, diff, obj, commit]);

  const start = async () => {
    if (!cfg.hero) { setErr("Wähle zuerst deinen Helden."); return; }
    setBusy(true); setErr(null);
    try {
      const q = new URLSearchParams({ mode: "bot", account: String(account), hero: String(cfg.hero), mates: cfg.mates.filter(Boolean).join(","), enemies: cfg.enemies.filter(Boolean).join(",") });
      const r = await (await fetch(`/api/scout?${q}`)).json();
      if (r.error || !r.players) throw new Error(r.error ?? "Keine Daten");
      setRes(r); setDiff(0); setObj([0, 0]); id.current = -Date.now();
      setRun({ t0: Date.now(), offset: Math.max(0, Math.round(startMin * 60)) });
    } catch (e) { setErr(e instanceof Error ? e.message : "Fehler"); }
    setBusy(false);
  };
  const stop = () => { setRun(null); setMeta(undefined); setRes(null); };

  const act = (d: number, o: [number, number]) => { setDiff(d); setObj(o); commit(d, o); };
  const shift = (s: number) => setRun((r) => (r ? { ...r, offset: Math.max(0, r.offset + s) } : r));
  void now;

  if (!run || !res) {
    return (
      <section className="surface mx-auto max-w-3xl space-y-4 p-6">
        <div>
          <h2 className="display text-xl font-bold">Bot-Match / Test</h2>
          <p className="mt-1 text-sm text-muted">Bot- und Übungsmatches erscheinen nicht in den Live-Daten. Gib hier die Helden an, starte die Uhr und stell Souls und Objectives per Knopf nach – dann zeigen Scouting und Coach dasselbe wie in einem echten Live-Match (ohne echte Spielerdaten der Bots).</p>
        </div>
        <Pick label="Dein Held" value={cfg.hero} heroes={heroes} onChange={(v) => save({ ...cfg, hero: v })} />
        <div>
          <div className="label mb-1.5">Dein Team (optional)</div>
          <div className="grid gap-2 sm:grid-cols-3">{cfg.mates.map((h, i) => <Pick key={i} value={h} heroes={heroes} onChange={(v) => save({ ...cfg, mates: cfg.mates.map((x, k) => (k === i ? v : x)) })} />)}</div>
        </div>
        <div>
          <div className="label mb-1.5">Gegner (optional)</div>
          <div className="grid gap-2 sm:grid-cols-3">{cfg.enemies.map((h, i) => <Pick key={i} value={h} heroes={heroes} onChange={(v) => save({ ...cfg, enemies: cfg.enemies.map((x, k) => (k === i ? v : x)) })} />)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">Start bei Minute <input type="number" min={0} max={90} value={startMin} onChange={(e) => setStartMin(Number(e.target.value) || 0)} className="input !w-20 !py-1" /></label>
          <button onClick={start} disabled={busy} className="btn btn-gold ml-auto"><Icon name="rocket" size={15} />{busy ? "Lädt …" : "Match starten"}</button>
        </div>
        {err && <div className="text-sm text-loss">{err}</div>}
      </section>
    );
  }

  const t = elapsed();
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="surface flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 px-3 py-1.5 text-xs">
        <span className="chip">Bot-Match · Testmodus</span>
        <span className="flex items-center gap-1">Zeit <b className="num text-sm">{Math.floor(t / 60)}:{String(t % 60).padStart(2, "0")}</b>
          <button className="btn btn-ghost !px-1.5 !py-0.5" onClick={() => shift(-60)}>−1 Min</button><button className="btn btn-ghost !px-1.5 !py-0.5" onClick={() => shift(60)}>+1 Min</button></span>
        <span className="flex items-center gap-1">Souls-Vorsprung <b className="num w-14 text-center text-sm" style={{ color: diff === 0 ? undefined : diff > 0 ? "#3ecf8e" : "#f0616d" }}>{diff > 0 ? "+" : diff < 0 ? "−" : "±"}{(Math.abs(diff) / 1000).toFixed(1)}k</b>
          {[-2000, -500, 500, 2000].map((s) => <button key={s} className="btn btn-ghost !px-1.5 !py-0.5" onClick={() => act(diff + s, obj)}>{s > 0 ? "+" : "−"}{Math.abs(s) / 1000}k</button>)}</span>
        <span className="flex items-center gap-1">Objectives <b className="num text-sm"><span className="text-amber">{obj[0]}</span> : <span className="text-sapphire">{obj[1]}</span></b>
          <button className="btn btn-ghost !px-1.5 !py-0.5" onClick={() => act(diff, [obj[0] + 1, obj[1]])}>Wir +1</button><button className="btn btn-ghost !px-1.5 !py-0.5" onClick={() => act(diff, [obj[0], obj[1] + 1])}>Gegner +1</button>
          <button className="btn btn-ghost !px-1.5 !py-0.5" onClick={() => act(diff, [0, 0])}>0</button></span>
        <button onClick={stop} className="btn btn-ghost ml-auto !py-0.5"><Icon name="x" size={13} />Beenden</button>
      </div>
      <div className="min-h-0 flex-1"><ScoutBoard r={res} match={meta} live /></div>
    </div>
  );
}

function Pick({ label, value, heroes, onChange }: { label?: string; value: number; heroes: { id: number; name: string }[]; onChange: (v: number) => void }) {
  return (
    <label className="block">
      {label && <div className="label mb-1.5">{label}</div>}
      {heroes.length === 0 ? <input type="number" min={0} value={value || ""} placeholder="Helden-ID (Bilder nicht geladen)" onChange={(e) => onChange(Number(e.target.value) || 0)} className="input w-full" /> :
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="input w-full">
        <option value={0}>– nicht angegeben –</option>
        {heroes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select>}
    </label>
  );
}
