"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import type { AimStats, CurveSeries } from "@/lib/training";

const fmt = (v: number, key: string) => (key === "nw" || key === "dmg" ? (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`) : v.toFixed(1));

/** Soll-/Ist-Kurve: dein Verlauf gegen das Referenzband (wie ein Recoil-Pattern, nur über die Spielzeit). */
export function CurveChart({ series, avgMinutes }: { series: CurveSeries; avgMinutes: number }) {
  const W = 680, H = 280, L = 52, R = 16, T = 16, B = 34;
  const ref = series.band?.avg ?? series.top ?? [];
  const vals = [...series.mine, ...(series.band?.hi ?? []), ...(series.top ?? [])];
  const max = Math.max(1e-6, ...vals) * 1.08;
  const x = (i: number) => L + (i / 10) * (W - L - R);
  const y = (v: number) => T + (1 - Math.min(v, max) / max) * (H - T - B);
  const line = (a: number[]) => a.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const [hover, setHover] = useState<number | null>(null);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const gaps = series.mine.length && ref.length ? series.mine.map((v, i) => v - ref[i]) : [];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(10, Math.round(((px - L) / (W - L - R)) * 10)))); }}>
        {ticks.map((t) => (
          <g key={t}><line x1={L} x2={W - R} y1={y(max * t)} y2={y(max * t)} stroke="rgba(255,255,255,.06)" /><text x={L - 8} y={y(max * t) + 4} textAnchor="end" className="fill-[#8b94a8] text-[10px]">{fmt(max * t, series.key)}</text></g>
        ))}
        {[0, 2, 4, 6, 8, 10].map((i) => (
          <text key={i} x={x(i)} y={H - 12} textAnchor="middle" className="fill-[#8b94a8] text-[10px]">{Math.round((avgMinutes * i) / 10)}′</text>
        ))}
        {series.band && <path d={`${series.band.avg.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("")}${[...series.band.hi].reverse().map((v, k) => `L${x(10 - k)},${y(v)}`).join("")}Z`} fill="rgba(62,207,142,.16)" stroke="none" />}
        {series.band && <path d={line(series.band.avg)} fill="none" stroke="#3ecf8e" strokeWidth={1.6} strokeDasharray="5 4" opacity={0.9} />}
        {series.top && <path d={line(series.top)} fill="none" stroke="#f0b44c" strokeWidth={1.4} strokeDasharray="2 4" opacity={0.85} />}
        {series.perMatch.map((c, i) => <path key={i} d={line(c)} fill="none" stroke="#4aa3ff" strokeWidth={1} opacity={0.14} />)}
        {series.mine.length > 0 && <path d={line(series.mine)} fill="none" stroke="#4aa3ff" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />}
        {hover !== null && series.mine.length > 0 && (
          <g><line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="rgba(255,255,255,.25)" /><circle cx={x(hover)} cy={y(series.mine[hover])} r={4.5} fill="#4aa3ff" stroke="#fff" /></g>
        )}
      </svg>
      <div className="mt-1 flex min-h-[22px] flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className="inline-block h-[3px] w-5 rounded bg-[#4aa3ff]" />Du (Schnitt)</span>
        {series.band && <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-5 rounded-sm bg-[#3ecf8e]/30" />Ideal-Band (Rang-Vergleich)</span>}
        {series.top && <span className="flex items-center gap-1.5"><i className="inline-block h-0 w-5 border-t-2 border-dotted border-[#f0b44c]" />Beste deiner Lobbys</span>}
        {hover !== null && series.mine.length > 0 && (
          <span className="ml-auto text-white">Bei {Math.round((avgMinutes * hover) / 10)}′: <b className="num">{fmt(series.mine[hover], series.key)}</b>{gaps.length ? <span className={gaps[hover] >= 0 === (series.key !== "d") ? "text-[#3ecf8e]" : "text-[#f0616d]"}> ({gaps[hover] >= 0 ? "+" : ""}{fmt(gaps[hover], series.key)} zur Referenz)</span> : null}</span>
        )}
      </div>
    </div>
  );
}

/** Streuung als Zielscheibe: Jeder Punkt ist ein Schuss; innerhalb des Rings = Treffer. */
function Target({ rate, label, color }: { rate: number; label: string; color: string }) {
  const dots = useMemo(() => Array.from({ length: 90 }, (_, i) => { const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 90); return { x: 50 + Math.cos(a) * r * 46, y: 50 + Math.sin(a) * r * 46, r }; }), []);
  const inner = Math.sqrt(Math.min(1, Math.max(0, rate)));
  return (
    <div className="text-center">
      <svg viewBox="0 0 100 100" className="mx-auto w-full max-w-[150px]">
        {[1, 0.66, 0.33].map((s) => <circle key={s} cx={50} cy={50} r={46 * s} fill="none" stroke="rgba(255,255,255,.08)" />)}
        <circle cx={50} cy={50} r={46 * inner} fill={`${color}22`} stroke={color} strokeWidth={1.2} />
        {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={1.9} fill={d.r <= inner ? color : "rgba(255,255,255,.28)"} />)}
      </svg>
      <div className="display num mt-1 text-xl font-bold" style={{ color }}>{Math.round(rate * 100)} %</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

export function AimPanel({ aim }: { aim: AimStats }) {
  const ref = aim.topAccuracy ?? aim.lobbyAccuracy;
  const rows: { label: string; mine: number | null; lobby: number | null; top: number | null }[] = [
    { label: "Trefferquote", mine: aim.accuracy, lobby: aim.lobbyAccuracy, top: aim.topAccuracy },
    { label: "Treffer auf Helden", mine: aim.heroHit, lobby: aim.lobbyHeroHit, top: aim.topHeroHit },
    { label: "Kopftreffer-Anteil", mine: aim.crit, lobby: aim.lobbyCrit, top: aim.topCrit },
  ];
  return (
    <div className="grid gap-6 sm:grid-cols-[1fr_1.3fr]">
      <div className="grid grid-cols-2 gap-3">
        {aim.accuracy !== null && <Target rate={aim.accuracy} label="Du" color="#4aa3ff" />}
        {ref != null && <Target rate={ref} label={aim.topAccuracy != null ? "Beste der Lobby" : "Lobby-Schnitt"} color="#f0b44c" />}
      </div>
      <div className="space-y-4 self-center">
        {rows.map((r) => r.mine === null ? null : (
          <div key={r.label}>
            <div className="mb-1 flex justify-between text-xs"><span className="text-muted">{r.label}</span><span className="num font-semibold">{Math.round(r.mine * 100)} %</span></div>
            <div className="relative h-2 rounded-full bg-white/[0.07]">
              <div className="h-full rounded-full bg-[#4aa3ff]" style={{ width: `${Math.min(100, r.mine * 100)}%` }} />
              {r.top != null && <i title={`Beste: ${Math.round(r.top * 100)} %`} className="absolute -top-1 h-4 w-[3px] rounded bg-[#f0b44c]" style={{ left: `${Math.min(99, r.top * 100)}%` }} />}
              {r.lobby != null && <i title={`Lobby: ${Math.round(r.lobby * 100)} %`} className="absolute -top-0.5 h-3 w-[2px] rounded bg-white/60" style={{ left: `${Math.min(99, r.lobby * 100)}%` }} />}
            </div>
          </div>
        ))}
        <p className="text-[11px] text-muted">Gelb: Beste deiner Lobbys · Weiß: Lobby-Schnitt · Basis: {aim.matches} Matches mit Trefferdaten</p>
      </div>
    </div>
  );
}

const useBest = (key: string, higher: boolean) => {
  const [best, setBest] = useState<number | null>(null);
  useEffect(() => { try { const v = localStorage.getItem(key); if (v) setBest(Number(v)); } catch { /* egal */ } }, [key]);
  const submit = (v: number) => {
    if (best === null || (higher ? v > best : v < best)) { setBest(v); try { localStorage.setItem(key, String(v)); } catch { /* egal */ } }
  };
  return [best, submit] as const;
};

/** Last-Hit-Trainer: Creep erst treffen, wenn seine Leben unter deinen Schaden fallen. */
export function LastHitTrainer() {
  const ROUNDS = 15, DMG = 28;
  const [state, setState] = useState<"idle" | "run" | "done">("idle");
  const [round, setRound] = useState(0);
  const [hp, setHp] = useState(100);
  const [res, setRes] = useState({ hit: 0, early: 0, late: 0 });
  const [flash, setFlash] = useState<string | null>(null);
  const [best, submit] = useBest("dl-trainer-lasthit", true);
  const hpRef = useRef(100);
  const rate = useRef(0);
  const settled = useRef(false);

  const next = (r: number) => { hpRef.current = 100; rate.current = 8 + Math.random() * 14; settled.current = false; setHp(100); setRound(r); };
  const finish = (partial: { hit: number; early: number; late: number }) => setRes(partial);

  useEffect(() => {
    if (state !== "run") return;
    const id = setInterval(() => {
      if (settled.current) return;
      hpRef.current = Math.max(0, hpRef.current - rate.current * 0.05 * (0.8 + Math.random() * 0.5));
      setHp(hpRef.current);
      if (hpRef.current <= 0) settle("late");
    }, 50);
    return () => clearInterval(id);
  });

  function settle(kind: "hit" | "early" | "late") {
    if (settled.current) return;
    settled.current = true;
    setFlash(kind === "hit" ? "Last Hit!" : kind === "early" ? "Zu früh" : "Verpasst – Gegner hat ihn");
    setTimeout(() => setFlash(null), 600);
    setRes((r) => {
      const n = { ...r, [kind]: r[kind] + 1 };
      if (round + 1 >= ROUNDS) { setState("done"); submit(n.hit); finish(n); } else setTimeout(() => next(round + 1), 450);
      return n;
    });
  }
  const start = () => { setRes({ hit: 0, early: 0, late: 0 }); setState("run"); next(0); };
  const onHit = () => { if (state !== "run" || settled.current) return; settle(hpRef.current <= DMG ? "hit" : "early"); };

  return (
    <div className="flex h-full flex-col">
      <p className="text-sm text-muted">Schlage zu, sobald die Leben unter die Markierung fallen. Zu früh und der Gegner holt sich die Souls, zu spät ebenso.</p>
      <div className="relative mt-4 flex-1 select-none rounded-xl border border-white/[0.06] bg-black/25 p-4">
        {state === "run" ? (
          <>
            <div className="mb-2 flex justify-between text-xs text-muted"><span>Creep {round + 1}/{ROUNDS}</span><span className="num">{res.hit} Last Hits</span></div>
            <div className="relative h-5 overflow-hidden rounded-full bg-white/[0.07]">
              <div className="h-full bg-gradient-to-r from-[#f0616d] to-[#f0b44c]" style={{ width: `${hp}%` }} />
              <i className="absolute inset-y-0 w-[2px] bg-white" style={{ left: `${DMG}%` }} />
            </div>
            <button onClick={onHit} className="btn mt-4 w-full justify-center py-3 text-base"><Icon name="sword" size={18} /> Zuschlagen</button>
            <div className={`pointer-events-none mt-3 h-6 text-center text-sm font-semibold transition ${flash ? "opacity-100" : "opacity-0"} ${flash === "Last Hit!" ? "text-[#3ecf8e]" : "text-[#f0616d]"}`}>{flash ?? "."}</div>
          </>
        ) : (
          <div className="py-3 text-center">
            {state === "done" && <div className="mb-3"><div className="display num text-3xl font-bold text-[#3ecf8e]">{res.hit}/{ROUNDS}</div><div className="text-xs text-muted">Last Hits · {res.early}× zu früh · {res.late}× verpasst</div></div>}
            <button onClick={start} className="btn justify-center px-6 py-2.5"><Icon name={state === "done" ? "refresh" : "bolt"} size={16} /> {state === "done" ? "Nochmal" : "Start"}</button>
          </div>
        )}
      </div>
      {best !== null && <div className="mt-2 text-xs text-muted">Persönlicher Rekord: <b className="text-white">{best}/{ROUNDS}</b></div>}
    </div>
  );
}

/** Aim- und Reaktionstrainer: 30 Sekunden Ziele treffen. */
export function AimTrainer() {
  const [state, setState] = useState<"idle" | "run" | "done">("idle");
  const [left, setLeft] = useState(30);
  const [target, setTarget] = useState<{ x: number; y: number; at: number } | null>(null);
  const [stats, setStats] = useState({ hits: 0, misses: 0, rt: [] as number[] });
  const [best, submit] = useBest("dl-trainer-aim", true);
  const area = useRef<HTMLDivElement>(null);
  const spawn = () => setTarget({ x: 8 + Math.random() * 84, y: 10 + Math.random() * 80, at: performance.now() });
  useEffect(() => {
    if (state !== "run") return;
    const id = setInterval(() => setLeft((l) => (l <= 1 ? 0 : l - 1)), 1000);
    return () => clearInterval(id);
  }, [state]);
  useEffect(() => { if (state === "run" && left === 0) { setState("done"); setTarget(null); submit(stats.hits); } }, [left, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = () => { setStats({ hits: 0, misses: 0, rt: [] }); setLeft(30); setState("run"); spawn(); };
  const avg = stats.rt.length ? Math.round(stats.rt.reduce((a, b) => a + b, 0) / stats.rt.length) : null;
  return (
    <div className="flex h-full flex-col">
      <p className="text-sm text-muted">Triff so viele Ziele wie möglich in 30 Sekunden. Verfehlte Klicks zählen gegen deine Quote.</p>
      <div ref={area} className="relative mt-4 min-h-[180px] flex-1 select-none overflow-hidden rounded-xl border border-white/[0.06] bg-black/25 cursor-crosshair"
        onMouseDown={() => { if (state === "run") setStats((s) => ({ ...s, misses: s.misses + 1 })); }}>
        {state === "run" && target && (
          <button aria-label="Ziel" style={{ left: `${target.x}%`, top: `${target.y}%` }} className="absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#f0616d] bg-[#f0616d]/25 shadow-[0_0_18px_#f0616d88] transition-transform active:scale-90"
            onMouseDown={(e) => { e.stopPropagation(); const rt = performance.now() - target.at; setStats((s) => ({ ...s, hits: s.hits + 1, rt: [...s.rt, rt] })); spawn(); }}>
            <span className="absolute inset-[9px] rounded-full bg-[#f0616d]" />
          </button>
        )}
        {state === "run" && <div className="absolute left-3 top-2 text-xs text-muted"><span className="num font-semibold text-white">{left}s</span> · {stats.hits} Treffer</div>}
        {state !== "run" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            {state === "done" && <div><div className="display num text-3xl font-bold text-[#3ecf8e]">{stats.hits}</div><div className="text-xs text-muted">Treffer · Quote {Math.round((stats.hits / Math.max(1, stats.hits + stats.misses)) * 100)} % · Reaktion Ø {avg ?? "–"} ms</div></div>}
            <button onClick={start} className="btn justify-center px-6 py-2.5"><Icon name={state === "done" ? "refresh" : "target"} size={16} /> {state === "done" ? "Nochmal" : "Start"}</button>
          </div>
        )}
      </div>
      {best !== null && <div className="mt-2 text-xs text-muted">Persönlicher Rekord: <b className="text-white">{best} Treffer</b></div>}
    </div>
  );
}
