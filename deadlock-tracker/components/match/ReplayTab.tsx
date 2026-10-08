"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeroPortrait, useHeroName } from "../GameAssets";
import { Icon } from "../Icon";
import { TEAMS } from "./Scoreboard";
import type { ReplayAnalysis, ReplayData, Scene } from "@/lib/replay-types";

interface Res { status: "none" | "running" | "error" | "done"; job?: { phase: string; pct: number; message?: string } | null; replay?: ReplayData; analysis?: ReplayAnalysis }

const CAUSE: Record<string, string> = {
  overextended: "Zu weit vorne", isolated: "Allein gestellt", outnumbered: "Unterzahl", lowhp: "Mit wenig Leben", focus: "Fokussiert",
  stayed: "Zu lange im Kampf", fresh: "Direkt nach Respawn", teamaway: "Weit vom Team", trade: "Getauscht", lost: "Kampf verloren",
  pick: "Pick", teamfight: "Teamfight", finish: "Finisher", duel: "Duell",
};
const KIND = { death: { c: "#f0616d", l: "Tod" }, kill: { c: "#3ecf8e", l: "Kill" }, assist: { c: "#4aa3ff", l: "Assist" } } as const;
const mmss = (s: number) => `${s < 0 ? "−" : ""}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, "0")}`;
const TONE = { good: "#3ecf8e", bad: "#f0616d", info: "#8b94a8" } as const;

/** 2D-Replay mit Szenen-Analyse: Positionen aller Spieler im Zeitverlauf, Sprungmarken für Tode/Kills, zu jeder Szene eine individuelle Erklärung. */
export function ReplayTab({ matchId, account }: { matchId: number; account: number }) {
  const [res, setRes] = useState<Res | null>(null);
  const load = useCallback(async () => {
    try { setRes(await (await fetch(`/api/replay/${matchId}?account=${account}`)).json()); } catch { setRes({ status: "error", job: { phase: "", pct: 0, message: "Server nicht erreichbar" } }); }
  }, [matchId, account]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (res?.status !== "running") return; const t = setInterval(load, 1500); return () => clearInterval(t); }, [res?.status, load]);
  const start = async () => { setRes({ status: "running", job: { phase: "Starte …", pct: 0 } }); await fetch(`/api/replay/${matchId}`, { method: "POST" }); load(); };

  if (!res) return <div className="skeleton h-[520px]" />;
  if (res.status !== "done" || !res.replay || !res.analysis) return <Start res={res} onStart={start} />;
  return <Player replay={res.replay} analysis={res.analysis} account={account} />;
}

function Start({ res, onStart }: { res: Res; onStart: () => void }) {
  const running = res.status === "running";
  return (
    <section className="surface relative overflow-hidden p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber/15 blur-[90px]" />
      <div className="relative mx-auto max-w-2xl text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"><Icon name="eye" size={26} className="text-amber" /></div>
        <h2 className="display text-2xl font-extrabold">2D-Replay &amp; Szenen-Analyse</h2>
        <p className="mt-2 text-sm text-muted">Spiel das Match auf einer Karte nach – mit allen Positionen – und erfahre für jeden Tod, Kill und Assist, was in genau dieser Szene passiert ist: Abstand zum Team, Überzahl, Leben, Zeit seit Respawn. Das Replay wird einmal geladen und ausgewertet (je nach Rechner und Leitung 1–3 Minuten); gespeichert wird nur die kleine Auswertung, die letzten 10 Matches bleiben erhalten.</p>
        {running ? (
          <div className="mx-auto mt-6 max-w-md">
            <div className="mb-1 flex justify-between text-xs text-muted"><span>{res.job?.phase ?? "Läuft …"}</span><span className="num">{res.job?.pct ?? 0} %</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber to-[#fff1c9] transition-all" style={{ width: `${Math.max(4, res.job?.pct ?? 0)}%` }} /></div>
          </div>
        ) : (
          <button onClick={onStart} className="btn btn-gold mx-auto mt-6"><Icon name="rocket" size={15} />{res.status === "error" ? "Erneut versuchen" : "Replay auswerten"}</button>
        )}
        {res.status === "error" && <p className="mx-auto mt-4 max-w-xl text-sm text-loss">{res.job?.message ?? "Fehlgeschlagen"}</p>}
      </div>
    </section>
  );
}

function Player({ replay, analysis, account }: { replay: ReplayData; analysis: ReplayAnalysis; account: number }) {
  const heroName = useHeroName();
  const me = replay.players.findIndex((p) => p.accountId === account);
  const n = replay.x[0]?.length ?? 0;
  const end = replay.tStart + (n - 1) * replay.step;
  const off = analysis.offset;
  const [rt, setRt] = useState(() => Math.max(replay.tStart, (analysis.scenes[0]?.rt ?? replay.tStart) - 10));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [sel, setSel] = useState<Scene | null>(analysis.scenes[0] ?? null);
  const stopAt = useRef<number | null>(null);

  // Wiedergabe
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setRt((cur) => {
        let nx = cur + dt * speed;
        if (stopAt.current !== null && nx >= stopAt.current) { stopAt.current = null; setPlaying(false); nx = cur + 0; return Math.min(end, Math.max(cur, nx)); }
        if (nx >= end) { setPlaying(false); return end; }
        return nx;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, end]);

  const pick = (s: Scene) => { setSel(s); setRt(Math.max(replay.tStart, s.rt - 8)); stopAt.current = s.rt + 3; setPlaying(true); };

  // Kartenausschnitt: gleiche Skalierung in x/y, 5 % Rand
  const view = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    replay.players.forEach((_, p) => { for (let i = 0; i < n; i += 4) { if (!replay.alive[p][i]) continue; const x = replay.x[p][i], y = replay.y[p][i]; if (!x && !y) continue; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
    if (!Number.isFinite(x0)) { x0 = -1; x1 = 1; y0 = -1; y1 = 1; }
    const span = Math.max(x1 - x0, y1 - y0) * 1.1 || 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return { cx, cy, span };
  }, [replay, n]);
  const toPct = (x: number, y: number) => [50 + ((x - view.cx) / view.span) * 100, 50 - ((y - view.cy) / view.span) * 100] as const;

  // Dichte-Karte als Hintergrund: zeigt, wo gespielt wurde (Lanes ergeben sich aus den Laufwegen)
  const density = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = density.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(160,190,255,0.014)";
    replay.players.forEach((_, p) => { for (let i = 0; i < n; i += 2) { if (!replay.alive[p][i]) continue; const [px, py] = toPct(replay.x[p][i], replay.y[p][i]); ctx.beginPath(); ctx.arc((px / 100) * c.width, (py / 100) * c.height, 7, 0, 6.283); ctx.fill(); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay, view]);

  const fi = Math.max(0, Math.min(n - 1, (rt - replay.tStart) / replay.step));
  const i0 = Math.floor(fi), i1 = Math.min(n - 1, i0 + 1), f = fi - i0;
  const at = (p: number) => {
    const a = replay.alive[p][i0] === 1, b = replay.alive[p][i1] === 1;
    const x = replay.x[p][i0] + (replay.x[p][i1] - replay.x[p][i0]) * (a && b ? f : 0), y = replay.y[p][i0] + (replay.y[p][i1] - replay.y[p][i0]) * (a && b ? f : 0);
    const mhp = replay.maxHp[p][i0] || 1;
    return { x, y, alive: replay.alive[p][i0] === 1, hp: Math.max(0, Math.min(1, replay.hp[p][i0] / mhp)) };
  };
  const trail = me >= 0 ? Array.from({ length: 13 }, (_, k) => Math.max(0, i0 - (12 - k) * 1)).filter((i, k, a) => a.indexOf(i) === k).filter((i) => replay.alive[me][i]).map((i) => toPct(replay.x[me][i], replay.y[me][i])) : [];
  const involved = new Set(sel ? [sel.other, ...sel.helpers, me] : []);
  const showLine = sel && Math.abs(rt - sel.rt) < 2.5 && sel.other >= 0 && me >= 0;

  const causes = Object.entries(analysis.causes).sort((a, b) => b[1] - a[1]);
  const gm = (t: number) => mmss(t - off);
  const markers = [
    ...replay.kills.map((k) => ({ t: k.t, c: k.victim === me ? "#f0616d" : k.attacker === me ? "#3ecf8e" : k.assisters.includes(me) ? "#4aa3ff" : "rgba(255,255,255,.18)", big: k.victim === me || k.attacker === me || k.assisters.includes(me) })),
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="surface p-4">
        <div className="mx-auto w-full max-w-[680px]">
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10" style={{ background: "radial-gradient(circle at 50% 50%, #121826, #070a10 75%)" }}>
            <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)", backgroundSize: "10% 10%" }} />
            <canvas ref={density} width={600} height={600} className="absolute inset-0 h-full w-full blur-[3px]" />
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              {trail.length > 1 && <polyline points={trail.map((p) => p.join(",")).join(" ")} fill="none" stroke="#fff1c9" strokeOpacity=".55" strokeWidth=".5" strokeLinecap="round" strokeLinejoin="round" />}
              {showLine && (() => { const a = at(sel!.other), b = at(me); const [ax, ay] = toPct(a.x, a.y), [bx, by] = toPct(b.x, b.y); return <line x1={ax} y1={ay} x2={bx} y2={by} stroke={KIND[sel!.kind].c} strokeWidth=".5" strokeDasharray="1.2 1" />; })()}
              {sel?.x !== undefined && sel.y !== undefined && (() => { const [sx, sy] = toPct(sel.x, sel.y); return <circle cx={sx} cy={sy} r="2.4" fill="none" stroke={KIND[sel.kind].c} strokeWidth=".4" strokeOpacity=".8" />; })()}
            </svg>
            {replay.players.map((p, pi) => {
              const a = at(pi); const [px, py] = toPct(a.x, a.y); const t = TEAMS[p.team];
              const mine = pi === me, inv = involved.has(pi);
              return (
                <div key={pi} className="absolute z-10 -translate-x-1/2 -translate-y-1/2 transition-opacity" style={{ left: `${px}%`, top: `${py}%`, opacity: a.alive ? 1 : 0.25 }} title={`${p.name ?? ""} ${p.heroId ? heroName(p.heroId) : ""}`}>
                  <div className="relative" style={{ filter: a.alive ? undefined : "grayscale(1)" }}>
                    {p.heroId ? <HeroPortrait id={p.heroId} size={mine ? 34 : 28} variant="small" ring={mine ? "#ffffff" : t.color} /> : <span className="block rounded-full" style={{ width: 24, height: 24, background: t.color }} />}
                    {inv && a.alive && <span className="pointer-events-none absolute -inset-1.5 rounded-full border-2" style={{ borderColor: mine ? "#fff1c9" : p.team === (replay.players[me]?.team ?? 0) ? "#3ecf8e" : "#f0616d", boxShadow: "0 0 12px currentColor" }} />}
                    {a.alive && <span className="absolute -bottom-1.5 left-1/2 h-[3px] w-6 -translate-x-1/2 overflow-hidden rounded bg-black/60"><span className="block h-full" style={{ width: `${a.hp * 100}%`, background: a.hp > 0.5 ? "#3ecf8e" : a.hp > 0.25 ? "#f0b44c" : "#f0616d" }} /></span>}
                  </div>
                </div>
              );
            })}
            <div className="absolute left-3 top-3 z-20 rounded-lg bg-black/60 px-2.5 py-1 text-xs backdrop-blur"><b className="num text-sm">{gm(rt)}</b><span className="ml-2 text-muted">Spielzeit</span></div>
            <div className="absolute bottom-2 right-3 z-20 text-[10px] text-muted">Karte aus den Laufwegen aller Spieler</div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button onClick={() => { stopAt.current = null; setPlaying((p) => !p); }} className="btn btn-gold !px-3.5" aria-label={playing ? "Pause" : "Abspielen"}><Icon name={playing ? "pause" : "play"} size={15} /></button>
            <div className="relative h-8 flex-1">
              <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/10" />
              {markers.map((m, i) => <span key={i} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${((m.t - replay.tStart) / (end - replay.tStart)) * 100}%`, width: m.big ? 7 : 3, height: m.big ? 7 : 8, background: m.c, boxShadow: m.big ? `0 0 6px ${m.c}` : undefined }} />)}
              <input type="range" min={replay.tStart} max={end} step={0.5} value={rt} onChange={(e) => { stopAt.current = null; setRt(Number(e.target.value)); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Zeit" />
              <span className="pointer-events-none absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded bg-white shadow" style={{ left: `calc(${((rt - replay.tStart) / (end - replay.tStart)) * 100}% - 2px)` }} />
            </div>
            <div className="flex gap-1">{[1, 2, 4, 8].map((s) => <button key={s} onClick={() => setSpeed(s)} className={`tab !px-2 !py-1 text-xs ${speed === s ? "tab-active" : ""}`}>{s}×</button>)}</div>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 text-[10px] text-muted">
            {(["death", "kill", "assist"] as const).map((k) => <span key={k}><i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: KIND[k].c }} />{KIND[k].l}</span>)}
            <span><i className="mr-1 inline-block h-2 w-[3px] rounded bg-white/30 align-middle" />andere Tode</span>
            {!analysis.aligned && <span className="text-amber">Zeit nicht exakt mit den Match-Daten abgeglichen</span>}
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        {causes.length > 0 && (
          <section className="surface p-4">
            <div className="label mb-2">Deine Tode im Überblick</div>
            <div className="flex flex-wrap gap-1.5">{causes.map(([k, c]) => <span key={k} className="chip"><b className="num mr-1">{c}×</b>{CAUSE[k] ?? k}</span>)}</div>
          </section>
        )}
        {sel && <SceneCard s={sel} replay={replay} onReplay={() => pick(sel)} />}
        <section className="surface overflow-hidden">
          <div className="border-b border-white/[0.06] px-4 py-2.5"><span className="label">Szenen</span> <span className="chip ml-1">{analysis.scenes.length}</span></div>
          <div className="max-h-[360px] overflow-y-auto">
            {analysis.scenes.length === 0 && <p className="p-4 text-sm text-muted">Keine Szenen für dich gefunden (Account im Replay nicht zugeordnet?).</p>}
            {analysis.scenes.map((s) => (
              <button key={s.id} onClick={() => pick(s)} className={`flex w-full items-center gap-3 border-b border-white/[0.04] px-4 py-2 text-left text-sm transition hover:bg-white/[0.04] ${sel?.id === s.id ? "bg-white/[0.06]" : ""}`}>
                <span className="num w-11 text-xs text-muted">{mmss(s.t)}</span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND[s.kind].c }} />
                <span className="min-w-0 flex-1 truncate">{s.headline}</span>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: KIND[s.kind].c }}>{KIND[s.kind].l}</span>
              </button>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function SceneCard({ s, replay, onReplay }: { s: Scene; replay: ReplayData; onReplay: () => void }) {
  const k = KIND[s.kind];
  const other = replay.players[s.other];
  return (
    <section className="surface relative overflow-hidden p-4" style={{ boxShadow: `inset 0 0 0 1px ${k.c}44` }}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl" style={{ background: `${k.c}33` }} />
      <div className="relative">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest" style={{ color: k.c }}>
          <span>{k.l}</span><span className="num text-muted">{mmss(s.t)}</span><span className="text-muted">· {CAUSE[s.cause] ?? s.cause}</span>
          <button onClick={onReplay} className="btn btn-ghost ml-auto !px-2 !py-1 text-[11px] normal-case tracking-normal"><Icon name="play" size={12} />Szene abspielen</button>
        </div>
        <div className="flex items-center gap-2">
          {other?.heroId ? <HeroPortrait id={other.heroId} size={34} variant="small" ring={k.c} /> : null}
          <h3 className="display text-lg font-extrabold leading-tight">{s.headline}</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-white/90">{s.why}</p>
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="label mb-1 !text-[10px]">{s.kind === "death" ? "So machst du es besser" : "Das hast du gut gemacht"}</div>
          <p className="text-sm leading-relaxed">{s.advice}</p>
        </div>
        <ul className="mt-3 space-y-1">
          {s.facts.map((f) => <li key={f.key} className="flex items-start gap-2 text-xs"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE[f.tone] }} /><span className="text-muted">{f.text}</span></li>)}
        </ul>
      </div>
    </section>
  );
}
