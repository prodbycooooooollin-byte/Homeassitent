"use client";
import { useMemo, useState } from "react";
import type { AimStats, CurveSeries, PhaseRate, SoulPlan } from "@/lib/training";

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

/** Soul-Quellen: wo du gegen die Besten deiner Lobbys Souls liegen lässt – und was ein Ausgleich konkret bedeuten würde. */
export function SoulPlanPanel({ plan, phases, compact }: { plan: SoulPlan; phases: PhaseRate[]; compact?: boolean }) {
  const max = Math.max(1, ...plan.rows.flatMap((r) => [r.mine, r.ref]));
  const pmax = Math.max(1, ...phases.flatMap((p) => [p.mine, p.ref]));
  return (
    <section className={compact ? "" : "surface p-5"}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4">
        <h3 className="label mr-auto">Woher deine Souls kommen</h3>
        <span className="text-xs text-muted">Du {Math.round(plan.mineTotal)}/Min · Beste deiner Lobbys {Math.round(plan.refTotal)}/Min · {plan.basis} Matches</span>
      </div>
      <div className={compact ? "grid gap-6" : "grid gap-8 lg:grid-cols-2"}>
        <div className="space-y-3">
          {plan.rows.map((r) => (
            <div key={r.key}>
              <div className="mb-1 flex justify-between text-xs"><span>{r.label}</span><span className={`num font-semibold ${r.gap > 0.05 * plan.refTotal ? "text-[#f0616d]" : r.gap < 0 ? "text-[#3ecf8e]" : "text-muted"}`}>{Math.round(r.mine)} <span className="text-muted">/ {Math.round(r.ref)} pro Min</span></span></div>
              <div className="relative h-2 rounded-full bg-white/[0.07]">
                <div className="h-full rounded-full bg-[#4aa3ff]" style={{ width: `${(r.mine / max) * 100}%` }} />
                <i className="absolute -top-1 h-4 w-[3px] rounded bg-[#f0b44c]" style={{ left: `${Math.min(99, (r.ref / max) * 100)}%` }} title={`Beste: ${Math.round(r.ref)}`} />
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted">Blau: du · Gelb: Beste deiner Lobbys (gleiche Rolle)</p>
        </div>
        <div>
          <div className="label mb-2 !text-[9px]">Souls pro Minute je Spielphase</div>
          <div className="flex h-32 items-end gap-3">
            {phases.map((p) => (
              <div key={p.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-24 w-full items-end gap-1"><div className="w-1/2 rounded-t bg-[#4aa3ff]" style={{ height: `${(p.mine / pmax) * 100}%` }} /><div className="w-1/2 rounded-t bg-[#f0b44c]/80" style={{ height: `${(p.ref / pmax) * 100}%` }} /></div>
                <span className="text-[10px] text-muted">{p.label}</span>
                <span className={`num text-[11px] font-semibold ${p.mine >= p.ref ? "text-[#3ecf8e]" : "text-[#f0616d]"}`}>{p.mine >= p.ref ? "+" : "−"}{Math.round(Math.abs(1 - p.mine / p.ref) * 100)} %</span>
              </div>
            ))}
          </div>
          {(plan.perCreep || plan.perCamp) && (
            <div className="mt-4 rounded-xl bg-white/[0.04] p-3 text-xs text-muted">
              Umrechnung aus deinen Daten:{plan.perCreep ? <> ein Lane-Creep bringt dir ≈ <b className="text-white">{Math.round(plan.perCreep)}</b> Souls</> : null}{plan.perCamp ? <>, ein Camp ≈ <b className="text-white">{Math.round(plan.perCamp)}</b></> : null}. Ein zusätzliches Camp pro 5 Minuten wären ≈ {plan.perCamp ? Math.round((plan.perCamp / 5)) : "–"} Souls/Min.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
