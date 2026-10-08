"use client";
import { Icon, type IconName } from "./Icon";
import { TIERS } from "@/lib/achievements";

/**
 * Sechseckige Medaille: Rand in Stufenfarbe (Bronze … Diamant), Fortschrittsring zur nächsten Stufe,
 * Symbol in der Mitte. Gesperrt = grau mit Schloss.
 */
export function Medal({ icon, tier, progress, size = 96, maxTier = 5 }: { icon: IconName; tier: number; progress: number; size?: number; maxTier?: number }) {
  const locked = tier === 0;
  const t = locked ? null : TIERS[Math.min(tier, TIERS.length) - 1];
  const next = TIERS[Math.min(tier, TIERS.length - 1)];
  const c = t?.color ?? "#4b5266";
  const ring = tier >= maxTier ? c : next.color;
  const R = 44, circ = 2 * Math.PI * R;
  const id = `m${icon}${tier}${size}`;
  return (
    <div className={`relative shrink-0 ${locked ? "" : "sheen"}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="overflow-visible">
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c} stopOpacity={locked ? 0.5 : 1} /><stop offset="1" stopColor={c} stopOpacity={locked ? 0.15 : 0.45} /></linearGradient>
          <radialGradient id={`${id}b`} cx=".5" cy=".3" r=".9"><stop offset="0" stopColor="#222839" /><stop offset="1" stopColor="#0b0e15" /></radialGradient>
        </defs>
        {/* Fortschrittsring zur nächsten Stufe */}
        <circle cx="50" cy="50" r={R + 4} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="2" />
        {tier < maxTier && <circle cx="50" cy="50" r={R + 4} fill="none" stroke={ring} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={2 * Math.PI * (R + 4)} strokeDashoffset={2 * Math.PI * (R + 4) * (1 - progress)} transform="rotate(-90 50 50)" style={{ transition: "stroke-dashoffset .8s ease", filter: `drop-shadow(0 0 3px ${ring})` }} />}
        <path d="M50 6l37 21.5v45L50 94 13 72.5v-45z" fill={`url(#${id}b)`} stroke={`url(#${id}g)`} strokeWidth="4" strokeLinejoin="round" style={locked ? undefined : { filter: `drop-shadow(0 0 10px ${c}88)` }} />
        <path d="M50 14l30 17.4v37.2L50 86 20 68.6V31.4z" fill="none" stroke={c} strokeOpacity={locked ? 0.12 : 0.3} strokeWidth="1" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" style={{ color: locked ? "#5b6478" : c }}>
        <Icon name={locked ? "lock" : icon} size={size * 0.34} className={locked ? "" : "drop-shadow-[0_0_6px_currentColor]"} />
      </div>
      {tier > 0 && (
        <div className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
          {Array.from({ length: maxTier }, (_, i) => <span key={i} className="h-1.5 w-1.5 rotate-45" style={{ background: i < tier ? TIERS[i].color : "rgba(255,255,255,.14)", boxShadow: i < tier ? `0 0 4px ${TIERS[i].color}` : undefined }} />)}
        </div>
      )}
    </div>
  );
}
