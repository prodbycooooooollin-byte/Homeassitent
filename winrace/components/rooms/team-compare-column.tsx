import { Trophy, Flame, Clock, Tv } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ProgressRing } from "@/components/ui/progress-ring";
import { deriveCurrentGame, summarizeTeamProgress } from "@/lib/client/derive";
import { PROGRESS_TYPE_UNIT } from "@/lib/labels";
import { formatRelativeTime, formatDuration } from "@/lib/time";
import { cn } from "@/lib/cn";
import type { GameView, TeamStatsView, TeamView } from "@/lib/types";

export function TeamCompareColumn({
  team,
  games,
  stats,
  leading,
  align = "left",
}: {
  team: TeamView;
  games: GameView[];
  stats: TeamStatsView | null;
  leading: boolean;
  align?: "left" | "right";
}) {
  const summary = summarizeTeamProgress(team, games);
  const currentGame = deriveCurrentGame(team, games);
  const currentProgress = currentGame ? currentGame.progress[team.id] : null;
  const liveMemberCount = team.members.filter((m) => m.twitchLogin).length;

  return (
    <div className={cn("flex flex-col gap-5", align === "right" && "sm:items-end sm:text-right")}>
      <div className={cn("flex items-center gap-4", align === "right" && "sm:flex-row-reverse")}>
        <ProgressRing percent={summary.overallPercent} color={team.color} size={104} strokeWidth={8} />
        <div>
          <div className={cn("flex items-center gap-2", align === "right" && "sm:flex-row-reverse")}>
            <h2 className="font-display text-2xl font-bold sm:text-3xl" style={{ color: team.color }}>
              {team.name}
            </h2>
            {leading && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-bold text-warning">
                <Trophy className="h-3.5 w-3.5" /> Führt
              </span>
            )}
          </div>
          <p className="text-sm text-ink-faint">
            {summary.completedGames}/{summary.totalGames} Spiele · {summary.totalWins} Siege gesamt
          </p>
        </div>
      </div>

      <div className={cn("flex -space-x-2", align === "right" && "sm:flex-row-reverse sm:space-x-0 sm:[&>*+*]:-mr-2")}>
        {team.members.map((m) => (
          <Avatar key={m.id} name={m.displayName} src={m.avatarUrl} size="sm" className="ring-2 ring-base" ring="#050509" />
        ))}
      </div>

      {currentGame ? (
        <div className="rounded-xl border border-base-border bg-white/[0.02] p-3">
          <p className="text-xs uppercase tracking-wide text-ink-faint">Aktuell gespielt</p>
          <p className="font-display font-semibold text-ink">
            {currentGame.name} – {currentProgress?.value ?? 0}/{currentGame.targetValue} {PROGRESS_TYPE_UNIT[currentGame.progressType]}
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-faint">Kein aktives Spiel</p>
      )}

      <dl className={cn("grid grid-cols-2 gap-3 text-sm", align === "right" && "sm:text-right")}>
        <div>
          <dt className="text-xs text-ink-faint">Verbleibende Siege</dt>
          <dd className="font-semibold text-ink">{summary.remainingWins}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-xs text-ink-faint">
            <Flame className="h-3 w-3" /> Serie
          </dt>
          <dd className="font-semibold text-ink">{stats ? `${stats.currentStreak} in Folge` : "–"}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-xs text-ink-faint">
            <Clock className="h-3 w-3" /> Ø pro Spiel
          </dt>
          <dd className="font-semibold text-ink">{stats?.averageTimePerGameMs ? formatDuration(stats.averageTimePerGameMs) : "–"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint">Letzte Aktivität</dt>
          <dd className="font-semibold text-ink">{stats?.lastWinAt ? formatRelativeTime(new Date(stats.lastWinAt)) : "–"}</dd>
        </div>
      </dl>

      {liveMemberCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-[#a970ff]">
          <Tv className="h-3.5 w-3.5" /> {liveMemberCount} Kanal{liveMemberCount === 1 ? "" : "äle"} hinterlegt
        </p>
      )}
    </div>
  );
}
