"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { HeroPortrait, useHeroName } from "./GameAssets";
import { GRADE_STYLE } from "./GradeBadge";
import { Icon } from "./Icon";
import { NavLink } from "./NavLink";
import { activity } from "@/lib/profile";
import { bestTimes, compareWindows, movingAverage, perWeek } from "@/lib/performance";
import type { MatchListItem } from "@/lib/view";

const COUNT = 24;
const WIN = "#3ecf8e", LOSS = "#f0616d";

function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [s, setS] = useState({ w: 600, h: 160 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setS({ w: Math.max(200, e.contentRect.width), h: Math.max(100, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...s };
}

function Delta({ v, unit = "", digits = 0, good = 1 }: { v: number | null; unit?: string; digits?: number; good?: 1 | -1 }) {
  if (v === null) return <span className="text-[11px] text-muted">–</span>;
  const up = v * good > 0.0001, flat = Math.abs(v) < Math.pow(10, -digits) / 2;
  const c = flat ? "#8b94a8" : up ? WIN : LOSS;
  return <span className="num flex items-center gap-0.5 text-[11px] font-bold" style={{ color: c }}>{!flat && <Icon name={v > 0 ? "trendUp" : "trendDown"} size={11} />}{flat ? "±0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`}{unit}</span>;
}

function Kpi({ label, value, delta, hint }: { label: string; value: string; delta: React.ReactNode; hint: string }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-3 py-2" title={hint}>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className="flex items-baseline gap-2"><span className="display num text-2xl font-extrabold">{value}</span>{delta}</div>
    </div>
  );
}

/** Leistung & Form: Kennzahlen im Vergleich zu den 10 Matches davor, Verlauf der Match-Noten und die besten Spielzeiten. */
export function PerformanceCard({ items, className = "" }: { items: MatchListItem[]; className?: string }) {
  const heroName = useHeroName();
  const cmp = useMemo(() => compareWindows(items), [items]);
  const times = useMemo(() => bestTimes(items), [items]);
  const last = useMemo(() => [...items.slice(0, COUNT)].reverse(), [items]);
  const scores = last.map((m) => m.score);
  const avg = movingAverage(scores, 5);
  const days = useMemo(() => activity(items, 5), [items]);
  const dayMax = Math.max(1, ...days.map((d) => d.n));
  const [hover, setHover] = useState<number | null>(null);
  const { ref, w, h } = useSize();

  const P = { l: 34, r: 10, t: 10, b: 20 };
  const vals = scores.filter((s): s is number => s !== null);
  const lo = Math.min(0.6, ...vals) - 0.05, hi = Math.max(1.4, ...vals) + 0.05;
  const x = (i: number) => P.l + (last.length <= 1 ? 0.5 : i / (last.length - 1)) * (w - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (h - P.t - P.b);
  const path = (xs: (number | null)[]) => xs.reduce<string>((a, v, i) => (v === null ? a : `${a}${a && xs[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`), "");
  const hv = hover !== null ? last[hover] : null;
  const wrNow = cmp.now.wr, wrBefore = cmp.before.wr;
  const slot = (s: { label: string; wr: number; n: number } | null, unit: string) => (s ? `${s.label}${unit} · ${Math.round(s.wr * 100)} % (${s.n})` : "noch zu wenig Daten");

  return (
    <section className={`surface flex flex-col gap-3 p-5 ${className}`}>
      <div className="flex items-center gap-2"><h3 className="label mr-auto">Leistung & Form</h3><span className="text-[11px] text-muted">letzte 10 gegen die 10 davor</span></div>

      <div className="grid grid-cols-3 gap-2.5">
        <Kpi label="Winrate" value={wrNow === null ? "–" : `${Math.round(wrNow * 100)} %`} delta={<Delta v={wrNow !== null && wrBefore !== null ? (wrNow - wrBefore) * 100 : null} unit=" %" />} hint="Siegquote der letzten 10 Matches, Änderung gegenüber den 10 davor" />
        <Kpi label="Ø Note" value={cmp.now.score === null ? "–" : cmp.now.score.toFixed(2)} delta={<Delta v={cmp.now.score !== null && cmp.before.score !== null ? cmp.now.score - cmp.before.score : null} digits={2} />} hint="Durchschnittlicher Rating-Score (1,00 = Lobby-Schnitt)" />
        <Kpi label="KDA" value={cmp.now.kda === null ? "–" : cmp.now.kda.toFixed(2)} delta={<Delta v={cmp.now.kda !== null && cmp.before.kda !== null ? cmp.now.kda - cmp.before.kda : null} digits={2} />} hint="(Kills + Assists) / Tode der letzten 10 Matches" />
      </div>

      <div className="relative min-h-[150px] flex-1" ref={ref}>
        {vals.length < 2 ? <div className="flex h-full items-center justify-center text-sm text-muted">Noch zu wenig bewertete Matches für einen Verlauf.</div> : (
          <>
            <svg width={w} height={h} className="absolute inset-0" onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = e.clientX - r.left; setHover(Math.max(0, Math.min(last.length - 1, Math.round(((px - P.l) / (w - P.l - P.r)) * (last.length - 1))))); }}>
              <defs><linearGradient id="perf-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#4aa3ff" stopOpacity=".28" /><stop offset="1" stopColor="#4aa3ff" stopOpacity="0" /></linearGradient></defs>
              {[lo + (hi - lo) * 0.15, 1, hi - (hi - lo) * 0.1].map((v, i) => (
                <g key={i}><line x1={P.l} x2={w - P.r} y1={y(v)} y2={y(v)} stroke={v === 1 ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.06)"} strokeDasharray={v === 1 ? "4 4" : undefined} /><text x={P.l - 6} y={y(v) + 3} textAnchor="end" className="fill-[#8b94a8] text-[9px]">{v.toFixed(2)}</text></g>
              ))}
              {last.map((m, i) => <rect key={m.matchId} x={x(i) - 3} y={h - P.b + 5} width={6} height={4} rx={2} fill={m.won ? WIN : LOSS} opacity={hover === i ? 1 : 0.7} />)}
              {avg.some((v) => v !== null) && <path d={`${path(avg)}L${x(last.length - 1)},${h - P.b}L${x(0)},${h - P.b}Z`} fill="url(#perf-fill)" stroke="none" />}
              <path d={path(avg)} fill="none" stroke="#4aa3ff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              {last.map((m, i) => m.score === null ? null : (
                <circle key={m.matchId} cx={x(i)} cy={y(m.score)} r={hover === i ? 6 : 4} fill={m.grade ? GRADE_STYLE[m.grade].glow.replace(/,[^,]*\)$/, ",1)") : "#8b94a8"} stroke="#0b0e15" strokeWidth={1.5} />
              ))}
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={h - P.b} stroke="rgba(255,255,255,.2)" />}
            </svg>
            {hv && (
              <NavLink href={`/match/${hv.matchId}`} className="absolute right-1 top-0 z-10 flex items-center gap-2 rounded-lg border border-white/10 bg-[#0b0e15]/90 px-2 py-1 text-xs backdrop-blur">
                <HeroPortrait id={hv.heroId} size={22} variant="small" className="!rounded-md" />
                <span className="font-semibold">{heroName(hv.heroId)}</span>
                <span className="num text-muted">{hv.kills}/{hv.deaths}/{hv.assists}</span>
                <span className="num font-bold">{hv.gradeLabel ?? hv.grade ?? "–"}</span>
                <span style={{ color: hv.won ? WIN : LOSS }}>{hv.won ? "Sieg" : "Niederlage"}</span>
              </NavLink>
            )}
          </>
        )}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-xl bg-white/[0.04] px-3 py-2"><div className="text-[10px] uppercase tracking-widest text-muted">Beste Tageszeit</div><div className="text-sm font-semibold">{slot(times.hour, " Uhr")}</div></div>
        <div className="rounded-xl bg-white/[0.04] px-3 py-2"><div className="text-[10px] uppercase tracking-widest text-muted">Bester Wochentag</div><div className="text-sm font-semibold">{slot(times.day, "")}</div></div>
        <div className="rounded-xl bg-white/[0.04] px-3 py-2">
          <div className="flex items-baseline justify-between"><div className="text-[10px] uppercase tracking-widest text-muted">Aktivität</div><span className="num text-[11px] text-muted">{perWeek(items)} / Woche</span></div>
          <div className="mt-1 flex gap-[3px]">{days.slice(-28).map((d, i) => <span key={i} title={`${d.date.toLocaleDateString("de-DE")}: ${d.n} Matches`} className="h-4 flex-1 rounded-[3px]" style={{ background: d.n ? `rgba(${d.wins / d.n >= 0.5 ? "62,207,142" : "240,97,109"},${0.3 + (d.n / dayMax) * 0.65})` : "rgba(255,255,255,.06)" }} />)}</div>
        </div>
      </div>
    </section>
  );
}
