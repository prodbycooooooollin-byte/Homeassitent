"use client";
import { RankEmblem, TIER_COLORS } from "../GameAssets";
import { Icon } from "../Icon";
import { formatBadge } from "@/lib/ranks";
import { rankProgress } from "@/lib/profile-customize";
import type { Overview } from "@/lib/view";

/** Kompakter Winrate-Ring (statische Dicke, sanfte Transition). */
function MiniRing({ value, size = 52 }: { value: number; size?: number }) {
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  const color = value >= 0.55 ? "#3ecf8e" : value >= 0.48 ? "#f0b44c" : "#f0616d";
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value))} style={{ transition: "stroke-dashoffset .8s ease-out" }} />
    </svg>
  );
}

/** Rechte Zone: großer Rang-Auftritt mit Glow, Peak, Divisionsstreifen und kompaktem Winrate-Ring. */
export function RankStage({ ov, showRing }: { ov: Overview; showRing: boolean }) {
  const badge = ov.currentBadge;
  const prog = rankProgress(badge, ov.rankHistory);
  const color = prog ? TIER_COLORS[prog.tier] ?? "#7b8497" : "#7b8497";
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative grid place-items-center" style={{ width: 160, height: 150 }}>
        {badge && <div aria-hidden className="absolute inset-0 rounded-full blur-2xl" style={{ background: `radial-gradient(circle, ${color}88, transparent 68%)` }} />}
        <div className="relative"><RankEmblem badge={badge} size={140} /></div>
      </div>
      <div className="label mt-1 !text-[10px]">Aktueller Rang</div>
      <div className="display text-3xl font-extrabold leading-tight" style={badge ? { color, textShadow: `0 0 24px ${color}66` } : undefined}>{badge ? formatBadge(badge) : "Noch ohne Rang"}</div>
      {prog && prog.peak && (
        <div className="num mt-0.5 text-xs text-muted">
          Peak {formatBadge(prog.peak)}
          {prog.trend !== null && prog.trend !== 0 && <span className={`ml-2 inline-flex items-center gap-0.5 ${prog.trend > 0 ? "text-win" : "text-loss"}`}><Icon name={prog.trend > 0 ? "trendUp" : "trendDown"} size={12} />{Math.abs(prog.trend)}</span>}
        </div>
      )}
      {prog && prog.tier >= 1 && (
        <div className="mt-3 w-full max-w-[220px]" aria-label={`Stufe ${prog.sub} von 6`}>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <span key={n} className="h-1.5 flex-1 rounded-full" style={{ background: n <= prog.sub ? color : "rgba(255,255,255,.1)", opacity: n === prog.sub ? 1 : n < prog.sub ? 0.6 : 1, boxShadow: n === prog.sub ? `0 0 8px ${color}` : undefined }} />
            ))}
          </div>
          <div className="num mt-1 text-[10px] text-muted">Stufe {prog.sub} von 6</div>
        </div>
      )}
      {showRing && ov.matches > 0 && (
        <div className="mt-3 flex items-center gap-2.5 border-t border-white/10 pt-3">
          <MiniRing value={ov.winrate} />
          <div className="text-left"><div className="display num text-xl font-bold leading-none">{Math.round(ov.winrate * 100)}%</div><div className="num mt-0.5 text-[10px] text-muted">{ov.wins}S · {ov.matches - ov.wins}N</div></div>
        </div>
      )}
    </div>
  );
}
