"use client";
import { badgeToLinear, linearToBadge, TIER_NAMES, formatBadge } from "@/lib/ranks";
import { TIER_COLORS } from "./GameAssets";

/** Rangverlauf als Liniendiagramm; Hilfslinien markieren die Tier-Grenzen. */
export function RankChart({ points }: { points: { t: number; badge: number; matchId: number }[] }) {
  const pts = points.map((p) => ({ ...p, y: badgeToLinear(p.badge) })).filter((p): p is typeof p & { y: number } => p.y !== null);
  if (pts.length < 2) return <div className="flex h-64 items-center justify-center text-sm text-muted">Noch zu wenige Ranked-Matches für einen Verlauf.</div>;
  const W = 900, H = 300, L = 92, R = 16, T = 16, B = 24;
  const lo = Math.max(1, Math.floor((Math.min(...pts.map((p) => p.y)) - 2) / 6) * 6 + 1);
  const hi = Math.ceil((Math.max(...pts.map((p) => p.y)) + 2) / 6) * 6 + 1;
  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(" ");
  const tiers: number[] = [];
  for (let v = lo; v <= hi; v += 6) tiers.push(Math.floor((v - 1) / 6));
  const last = pts[pts.length - 1];
  const lastColor = TIER_COLORS[Math.floor(last.badge / 10)] ?? "#f0b44c";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="rk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={lastColor} stopOpacity=".35" /><stop offset="1" stopColor={lastColor} stopOpacity="0" /></linearGradient>
      </defs>
      {tiers.map((t) => {
        const v = t * 6 + 1;
        return (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,.08)" strokeDasharray="3 5" />
            <text x={L - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill={TIER_COLORS[t] ?? "#8b94a8"} fontWeight="600">{TIER_NAMES[t] ?? ""}</text>
          </g>
        );
      })}
      <path d={`${line} L${x(pts.length - 1)} ${H - B} L${x(0)} ${H - B} Z`} fill="url(#rk)" />
      <path d={line} fill="none" stroke={lastColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${lastColor})` }} />
      {pts.map((p, i) => (
        <circle key={p.matchId} cx={x(i)} cy={y(p.y)} r={i === pts.length - 1 ? 5 : 3} fill={i === pts.length - 1 ? "#fff" : lastColor} stroke="#0a0c12" strokeWidth="1.5">
          <title>{formatBadge(linearToBadge(p.y))} · {new Date(p.t * 1000).toLocaleDateString("de-DE")}</title>
        </circle>
      ))}
    </svg>
  );
}
