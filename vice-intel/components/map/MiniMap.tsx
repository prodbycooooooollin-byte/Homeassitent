import Link from "next/link";
import { Expand } from "lucide-react";
import { MapBase, mapDisclaimer } from "./MapBase";
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
          <MapBase id="mm" />
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
        {mapDisclaimer()}
      </p>
    </div>
  );
}
