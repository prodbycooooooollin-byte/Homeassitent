"use client";
import { useEffect, useRef, useState } from "react";

export function useCountUp(target: number, ms = 800): number {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setV(a + (target - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function WinRing({ value, size = 96, wins, losses }: { value: number; size?: number; wins: number; losses: number }) {
  const shown = useCountUp(value * 100);
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const color = value >= 0.55 ? "#3ecf8e" : value >= 0.48 ? "#f0b44c" : "#f0616d";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} style={{ filter: `drop-shadow(0 0 6px ${color}88)` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="display num text-2xl font-extrabold leading-none">{Math.round(shown)}%</span>
        <span className="num mt-0.5 text-[10px] text-muted">{wins}S · {losses}N</span>
      </div>
    </div>
  );
}

/** Verlauf der Rating-Scores; gestrichelte Linie = Lobby-Schnitt (1.00). */
export function Sparkline({ values, height = 72 }: { values: number[]; height?: number }) {
  if (values.length < 2) return <div className="flex h-[72px] items-center justify-center text-xs text-muted">Zu wenig Daten</div>;
  const w = 300;
  const min = Math.min(0.5, ...values), max = Math.max(1.5, ...values);
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => height - 6 - ((v - min) / (max - min)) * (height - 12);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${height} L0 ${height} Z`;
  const last = values[values.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f0b44c" stopOpacity=".35" /><stop offset="1" stopColor="#f0b44c" stopOpacity="0" /></linearGradient>
      </defs>
      <line x1="0" x2={w} y1={y(1)} y2={y(1)} stroke="rgba(255,255,255,.18)" strokeDasharray="4 4" />
      <path d={area} fill="url(#spark)" />
      <path d={line} fill="none" stroke="#f0b44c" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(values.length - 1)} cy={y(last)} r="3.5" fill="#fff1c9" stroke="#f0b44c" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function FormDots({ form }: { form: boolean[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {form.map((w, i) => (
        <span key={i} title={w ? "Sieg" : "Niederlage"} className="h-5 w-5 rounded-md"
          style={{ background: w ? "linear-gradient(145deg,#3ecf8e,#1d8a5c)" : "linear-gradient(145deg,#f0616d,#a02535)", opacity: 1 - i * 0.025 }} />
      ))}
    </div>
  );
}

export interface Series { id: string; label: string; color: string; values: number[]; width?: number; dim?: boolean }

/** Mehrlinien-Diagramm über Zeit (Sekunden) mit Fadenkreuz und Tooltip. */
export function LineChart({ xs, series, height = 300, fmtY = (v: number) => String(Math.round(v)) }: { xs: number[]; series: Series[]; height?: number; fmtY?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 900, L = 56, R = 14, T = 12, B = 26;
  const maxX = xs[xs.length - 1] || 1;
  const maxY = Math.max(1, ...series.flatMap((s) => s.values)) * 1.05;
  const x = (t: number) => L + (t / maxX) * (W - L - R);
  const y = (v: number) => T + (1 - v / maxY) * (height - T - B);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(xs[i]).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
  const mins = Array.from({ length: Math.floor(maxX / 300) + 1 }, (_, i) => i * 300);
  const hi = hover === null ? null : Math.min(xs.length - 1, Math.max(0, hover));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const t = ((px - L) / (W - L - R)) * maxX;
          let best = 0; xs.forEach((v, i) => { if (Math.abs(v - t) < Math.abs(xs[best] - t)) best = i; });
          setHover(best);
        }}>
        {ticks.map((v) => (<g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,.07)" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#8b94a8">{fmtY(v)}</text></g>))}
        {mins.map((t) => (<text key={t} x={x(t)} y={height - 8} textAnchor="middle" fontSize="11" fill="#8b94a8">{Math.round(t / 60)}′</text>))}
        {[...series].sort((a, b) => Number(!!b.dim) - Number(!!a.dim)).map((s) => (
          <path key={s.id} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeLinejoin="round" strokeLinecap="round" opacity={s.dim ? 0.32 : 1}
            style={s.dim ? undefined : { filter: `drop-shadow(0 0 4px ${s.color}88)` }} />
        ))}
        {hi !== null && <line x1={x(xs[hi])} x2={x(xs[hi])} y1={T} y2={height - B} stroke="rgba(255,255,255,.35)" strokeDasharray="3 3" />}
        {hi !== null && series.filter((s) => !s.dim).map((s) => <circle key={s.id} cx={x(xs[hi])} cy={y(s.values[hi])} r="4" fill={s.color} stroke="#0a0c12" strokeWidth="1.5" />)}
      </svg>
      {hi !== null && (
        <div className="surface pointer-events-none absolute right-2 top-2 min-w-[150px] p-2 text-xs">
          <div className="label mb-1">{Math.floor(xs[hi] / 60)}:{String(xs[hi] % 60).padStart(2, "0")}</div>
          {series.filter((s) => !s.dim).map((s) => (<div key={s.id} className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span><b className="num">{fmtY(s.values[hi])}</b></div>))}
        </div>
      )}
    </div>
  );
}

/** Flächendiagramm um Nulllinie: positiv = Team 0 vorn (Gold), negativ = Team 1 vorn (Blau). */
export function AdvantageChart({ data, height = 220, labels = ["Hidden King", "Archmother"] }: { data: { t: number; diff: number }[]; height?: number; labels?: [string, string] }) {
  const W = 900, L = 56, R = 14, T = 14, B = 24;
  const maxT = data[data.length - 1]?.t || 1;
  const m = Math.max(1000, ...data.map((d) => Math.abs(d.diff))) * 1.1;
  const x = (t: number) => L + (t / maxT) * (W - L - R);
  const y = (v: number) => T + (1 - (v + m) / (2 * m)) * (height - T - B);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(d.t).toFixed(1)} ${y(d.diff).toFixed(1)}`).join(" ");
  const zero = y(0);
  const k = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full">
      <defs>
        <clipPath id="adv-up"><rect x="0" y="0" width={W} height={zero} /></clipPath>
        <clipPath id="adv-dn"><rect x="0" y={zero} width={W} height={height} /></clipPath>
      </defs>
      {[m * 0.66, 0, -m * 0.66].map((v) => (<g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.07)"} /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#8b94a8">{k(v)}</text></g>))}
      <path d={`${line} L${x(maxT)} ${zero} L${x(0)} ${zero} Z`} fill="#f0b44c" fillOpacity=".35" clipPath="url(#adv-up)" />
      <path d={`${line} L${x(maxT)} ${zero} L${x(0)} ${zero} Z`} fill="#4aa3ff" fillOpacity=".35" clipPath="url(#adv-dn)" />
      <path d={line} fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="2" strokeLinejoin="round" />
      <text x={L + 6} y={T + 10} fontSize="11" fill="#f0b44c" fontWeight="700">{labels[0]} vorn</text>
      <text x={L + 6} y={height - B - 6} fontSize="11" fill="#4aa3ff" fontWeight="700">{labels[1]} vorn</text>
      {Array.from({ length: Math.floor(maxT / 300) + 1 }, (_, i) => i * 300).map((t) => (<text key={t} x={x(t)} y={height - 6} textAnchor="middle" fontSize="11" fill="#8b94a8">{Math.round(t / 60)}′</text>))}
    </svg>
  );
}
