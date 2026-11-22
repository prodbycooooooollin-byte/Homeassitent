import Link from "next/link";
import { Expand } from "lucide-react";
import { KEYS, LAKE, LAND_PATH, MAP_DISCLAIMER, ROADS } from "@/lib/map/leonida";
import type { MapPoint } from "@/lib/content/schema";

/** Static schematic map with one highlighted pin; links to the interactive map. */
export function MiniMap({ point, focusId, label }: { point: MapPoint; focusId: string; label: string }) {
  const vb = 360;
  const x = Math.max(vb / 2, Math.min(1000 - vb / 2, point.x)) - vb / 2;
  const y = Math.max(vb / 2, Math.min(1000 - vb / 2, point.y)) - vb / 2;
  return (
    <div>
      <Link href={`/map?focus=${encodeURIComponent(focusId)}`} className="group relative block overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b1626]" aria-label={`Open ${label} on the map`}>
        <svg viewBox={`${x} ${y} ${vb} ${vb}`} className="aspect-[4/3] w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs>
            <pattern id="mm-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0H0V20" fill="none" stroke="#ffffff" strokeOpacity=".04" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="1000" height="1000" fill="#0a1424" />
          <rect x="0" y="0" width="1000" height="1000" fill="url(#mm-grid)" />
          <path d={LAND_PATH} fill="#1c3a2c" stroke="#3d6b55" strokeWidth="2" />
          <ellipse {...LAKE} fill="#0f2338" />
          {KEYS.map((k, i) => (
            <ellipse key={i} cx={k.cx} cy={k.cy} rx={k.rx} ry={k.ry} transform={`rotate(${k.rot} ${k.cx} ${k.cy})`} fill="#1c3a2c" stroke="#3d6b55" />
          ))}
          {ROADS.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#c9b8e8" strokeOpacity=".35" strokeWidth="2" />
          ))}
          {point.precision !== "exact" ? <circle cx={point.x} cy={point.y} r={point.precision === "region" ? 46 : 22} fill="#a855f7" fillOpacity=".15" stroke="#a855f7" strokeOpacity=".5" strokeDasharray="4 4" /> : null}
          <circle cx={point.x} cy={point.y} r="12" fill="#a855f7" fillOpacity=".35" />
          <circle cx={point.x} cy={point.y} r="6" fill="#f5f3ff" stroke="#a855f7" strokeWidth="3" />
        </svg>
        <span className="absolute right-2 top-2 rounded-lg bg-black/50 p-1.5 text-white/80 backdrop-blur transition group-hover:bg-violet-500/60">
          <Expand className="h-4 w-4" />
        </span>
      </Link>
      <p className="mt-2 text-[11px] text-fg-faint">
        {point.precision === "region" ? "Region-level location. " : point.precision === "approximate" ? "Approximate pin. " : ""}
        {MAP_DISCLAIMER}
      </p>
    </div>
  );
}
