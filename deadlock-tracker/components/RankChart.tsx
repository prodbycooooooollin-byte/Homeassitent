"use client";
import { badgeToLinear, linearToBadge, TIER_NAMES, formatBadge } from "@/lib/ranks";
import { TIER_COLORS } from "./GameAssets";

interface Pt { t: number; badge: number; matchId: number; lobby?: number | null; won?: boolean }

/** Rangverlauf als Liniendiagramm (gelb gestrichelt: Ø Lobby-Rang); Hilfslinien markieren die Tier-Grenzen. */
export function RankChart({ points }: { points: Pt[] }) {
  const pts = points.map((p) => ({ ...p, y: badgeToLinear(p.badge), ly: badgeToLinear(p.lobby ?? null) })).filter((p): p is typeof p & { y: number } => p.y !== null);
  if (pts.length < 2) return <div className="flex h-64 items-center justify-center text-sm text-muted">Noch zu wenige Ranked-Matches für einen Verlauf.</div>;
  const W = 900, H = 320, L = 92, R = 16, T = 16, B = 24;
  const all = pts.flatMap((p) => (p.ly !== null ? [p.y, p.ly] : [p.y]));
  const lo = Math.max(1, Math.floor((Math.min(...all) - 2) / 6) * 6 + 1);
  const hi = Math.ceil((Math.max(...all) + 2) / 6) * 6 + 1;
  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(" ");
  const lobbyPts = pts.map((p, i) => (p.ly !== null ? `${x(i).toFixed(1)} ${y(p.ly).toFixed(1)}` : null)).filter(Boolean) as string[];
  const lobbyLine = lobbyPts.length > 1 ? "M" + lobbyPts.join(" L") : "";
  const tiers: number[] = [];
  for (let v = lo; v <= hi; v += 6) tiers.push(Math.floor((v - 1) / 6));
  const last = pts[pts.length - 1];
  const lastColor = TIER_COLORS[Math.floor(last.badge / 10)] ?? "#f0b44c";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs><linearGradient id="rk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={lastColor} stopOpacity=".35" /><stop offset="1" stopColor={lastColor} stopOpacity="0" /></linearGradient></defs>
      {tiers.map((t) => {
        const v = t * 6 + 1;
        return (<g key={t}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,.08)" strokeDasharray="3 5" /><text x={L - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill={TIER_COLORS[t] ?? "#8b94a8"} fontWeight="600">{TIER_NAMES[t] ?? ""}</text></g>);
      })}
      <path d={`${line} L${x(pts.length - 1)} ${H - B} L${x(0)} ${H - B} Z`} fill="url(#rk)" />
      {lobbyLine && <path d={lobbyLine} fill="none" stroke="#f0b44c" strokeOpacity=".8" strokeWidth="1.8" strokeDasharray="5 4" />}
      <path d={line} fill="none" stroke={lastColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${lastColor})` }} />
      {pts.map((p, i) => (
        <circle key={p.matchId} cx={x(i)} cy={y(p.y)} r={i === pts.length - 1 ? 5 : 3} fill={i === pts.length - 1 ? "#fff" : p.won === false ? "#f0616d" : p.won ? "#3ecf8e" : lastColor} stroke="#0a0c12" strokeWidth="1.5">
          <title>{formatBadge(linearToBadge(p.y))} · {new Date(p.t * 1000).toLocaleDateString("de-DE")}{p.lobby ? ` · Lobby Ø ${formatBadge(p.lobby)}` : ""}</title>
        </circle>
      ))}
      <g fontSize="11" fill="#8b94a8"><circle cx={L + 8} cy={H - 4} r="3" fill="#3ecf8e" /><text x={L + 16} y={H - 1}>Sieg</text><circle cx={L + 56} cy={H - 4} r="3" fill="#f0616d" /><text x={L + 64} y={H - 1}>Niederlage</text><line x1={L + 130} x2={L + 150} y1={H - 4} y2={H - 4} stroke="#f0b44c" strokeDasharray="4 3" /><text x={L + 156} y={H - 1}>Ø Lobby-Rang</text></g>
    </svg>
  );
}
