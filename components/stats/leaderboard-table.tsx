import Link from "next/link";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { formatNumber, formatTicksDuration } from "@/lib/format";
import type { LeaderboardEntry, LeaderboardMetric } from "@/lib/stats/leaderboards";

const MEDAL = ["🥇", "🥈", "🥉"];

export function LeaderboardTable({ entries, metric }: { entries: LeaderboardEntry[]; metric: LeaderboardMetric }) {
  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">Noch keine Daten für diesen Zeitraum.</p>;
  }

  return (
    <div className="space-y-1">
      {entries.slice(0, 20).map((e) => (
        <Link
          key={e.minecraftAccountId}
          href={`/spieler/${e.uuid}`}
          className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-raised"
        >
          <span className="w-7 shrink-0 text-center text-sm text-ink-muted">
            {MEDAL[e.rank - 1] ?? `#${e.rank}`}
          </span>
          <PlayerAvatar uuid={e.uuid} username={e.username} size={28} />
          <span className="flex-1 truncate text-sm text-ink">{e.username}</span>
          <span className="text-sm font-medium text-ink">
            {metric === "playtimeTicks" ? formatTicksDuration(e.value) : formatNumber(e.value)}
          </span>
        </Link>
      ))}
    </div>
  );
}
