import { formatBadge, tierOf } from "@/lib/ranks";

const TIER_COLOR = ["#888", "#9aa3b2", "#7fb069", "#c58b5c", "#6ea8fe", "#b388eb", "#4dd0c8", "#f0b44c", "#ff8a65", "#ef5da8", "#ffd54f", "#ff5252"];

export function RankBadge({ badge }: { badge: number | null | undefined }) {
  if (!badge) return <span className="text-muted">–</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: TIER_COLOR[tierOf(badge)] ?? "#888" }} />
      {formatBadge(badge)}
    </span>
  );
}
