"use client";
import { useId } from "react";
import { Icon, type IconName } from "./Icon";
import { TIERS } from "@/lib/achievements";

/** Metall-Paletten je Stufe: Licht, Mitte, Schatten. */
const METAL = [
  { hi: "#ffd2a6", mid: "#cd7f32", lo: "#6e4015" },
  { hi: "#ffffff", mid: "#c4ccda", lo: "#69738a" },
  { hi: "#fff3c4", mid: "#f0b44c", lo: "#9a6212" },
  { hi: "#eafcff", mid: "#7fd8ea", lo: "#27829a" },
  { hi: "#f4eaff", mid: "#b48cff", lo: "#573499" },
] as const;

const HEX = "M50 5 L88 27 V73 L50 95 L12 73 V27 Z";
const HEX_IN = "M50 13 L81 31 V69 L50 87 L19 69 V31 Z";

/**
 * Medaille: Sechseck mit Metall-Rand, Gravur-Symbol und stufenabhängigem Schmuck
 * (Silber: zweiter Rand, Gold: Nieten, Platin: Flügel, Diamant: Edelstein + Glanz). Gesperrt = entsättigt mit kleinem Schloss.
 * Der Fortschritt zur nächsten Stufe wird nicht in der Medaille, sondern von der Umgebung (Balken) gezeigt.
 */
export function Medal({ icon, tier, size = 96, maxTier = 5, pips = true }: { icon: IconName; tier: number; progress?: number; size?: number; maxTier?: number; pips?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const locked = tier === 0;
  const m = METAL[Math.min(Math.max(tier, 1), 5) - 1];
  const rim = locked ? ["#4a5266", "#2c3344", "#1a1f2b"] : [m.hi, m.mid, m.lo];
  const glow = locked ? "none" : `drop-shadow(0 4px 12px ${m.mid}66)`;
  return (
    <div className="inline-flex shrink-0 flex-col items-center" style={{ gap: Math.max(3, size * 0.05) }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} style={{ filter: glow }} className="overflow-visible">
          <defs>
            <linearGradient id={`${uid}r`} x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stopColor={rim[0]} /><stop offset=".45" stopColor={rim[1]} /><stop offset="1" stopColor={rim[2]} /></linearGradient>
            <radialGradient id={`${uid}f`} cx=".5" cy=".25" r=".95"><stop offset="0" stopColor={locked ? "#1d2330" : `${m.mid}55`} /><stop offset=".6" stopColor="#10141d" /><stop offset="1" stopColor="#080a10" /></radialGradient>
            <linearGradient id={`${uid}i`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={locked ? "#5b6478" : m.hi} /><stop offset="1" stopColor={locked ? "#3a4152" : m.mid} /></linearGradient>
            <clipPath id={`${uid}c`}><path d={HEX} /></clipPath>
            <linearGradient id={`${uid}s`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          </defs>

          {/* Flügel (Platin, Diamant) */}
          {tier >= 4 && <>
            <path d="M12 38 L-4 30 L2 48 L-6 60 L12 58Z" fill={`url(#${uid}r)`} opacity=".9" />
            <path d="M88 38 L104 30 L98 48 L106 60 L88 58Z" fill={`url(#${uid}r)`} opacity=".9" />
          </>}

          {/* Körper */}
          <path d={HEX} fill={`url(#${uid}r)`} />
          <path d={HEX_IN} fill={`url(#${uid}f)`} stroke="#000" strokeOpacity=".5" strokeWidth="1.2" />
          {/* Fase: oben hell, unten dunkel */}
          <path d="M50 5 L88 27 L81 31 L50 13Z" fill="#fff" opacity={locked ? 0.08 : 0.28} />
          <path d="M50 95 L12 73 L19 69 L50 87Z" fill="#000" opacity=".28" />
          {tier >= 2 && <path d="M50 18 L76 33.5 V66.5 L50 82 L24 66.5 V33.5Z" fill="none" stroke={rim[1]} strokeOpacity=".5" strokeWidth="1" />}
          {/* Nieten (Gold ab) */}
          {tier >= 3 && [[50, 9], [84, 29], [84, 71], [50, 91], [16, 71], [16, 29]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.9" fill={rim[0]} stroke="#000" strokeOpacity=".4" strokeWidth=".6" />)}
          {/* Edelstein (Diamant) */}
          {tier >= 5 && <path d="M50 -3 L57 5 L50 13 L43 5Z" fill="#f4eaff" stroke="#b48cff" strokeWidth="1.2" />}
          {/* Glanz (Diamant) */}
          {tier >= 5 && (
            <g clipPath={`url(#${uid}c)`} className="medal-shine">
              <rect x="-40" y="0" width="30" height="100" fill={`url(#${uid}s)`} transform="skewX(-20)">
                <animate attributeName="x" from="-60" to="140" dur="3.4s" repeatCount="indefinite" />
              </rect>
            </g>
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: size * 0.02 }}>
          <div style={{ color: locked ? "#5b6478" : m.mid, opacity: locked ? 0.55 : 1, filter: locked ? undefined : `drop-shadow(0 1px 1px #000a) drop-shadow(0 0 5px ${m.mid}88)` }}><Icon name={icon} size={size * 0.36} /></div>
        </div>
        {locked && <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border border-white/15 bg-[#0d1119] text-muted" style={{ width: size * 0.28, height: size * 0.28 }}><Icon name="lock" size={size * 0.15} /></span>}
      </div>
      {pips && !locked && (
        <div className="flex gap-1">
          {Array.from({ length: maxTier }, (_, i) => <span key={i} className="rotate-45" style={{ width: Math.max(5, size * 0.065), height: Math.max(5, size * 0.065), background: i < tier ? TIERS[i].color : "rgba(255,255,255,.12)", boxShadow: i < tier ? `0 0 5px ${TIERS[i].color}` : undefined }} />)}
        </div>
      )}
    </div>
  );
}
