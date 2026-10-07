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
