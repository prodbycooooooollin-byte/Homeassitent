import { Card, CardContent } from "@/components/ui/card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Avatar } from "@/components/ui/avatar";
import { deriveCurrentGame, summarizeTeamProgress } from "@/lib/client/derive";
import { PROGRESS_TYPE_UNIT } from "@/lib/labels";
import type { GameView, TeamView } from "@/lib/types";

export function TeamSummaryCard({ team, games, leading }: { team: TeamView; games: GameView[]; leading: boolean }) {
  const summary = summarizeTeamProgress(team, games);
  const currentGame = deriveCurrentGame(team, games);
  const currentProgress = currentGame ? currentGame.progress[team.id] : null;

  return (
    <Card className="relative overflow-hidden" style={{ boxShadow: `inset 3px 0 0 0 ${team.color}` }}>
      {leading && (
        <div className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: `${team.color}33`, color: team.color }}>
          Führt
        </div>
      )}
      <CardContent className="flex items-center gap-4 pt-5">
        <ProgressRing percent={summary.overallPercent} color={team.color} size={80} strokeWidth={7} />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-ink-faint">Team {team.side}</p>
          <h3 className="truncate font-display text-lg font-bold" style={{ color: team.color }}>
            {team.name}
          </h3>
          <p className="mt-1 text-sm text-ink-muted">
            {summary.completedGames}/{summary.totalGames} Spiele abgeschlossen
          </p>
          {currentGame ? (
            <p className="mt-0.5 truncate text-xs text-ink-faint">
              Aktuell: {currentGame.name} ({currentProgress?.value ?? 0}/{currentGame.targetValue} {PROGRESS_TYPE_UNIT[currentGame.progressType]})
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-ink-faint">Kein aktives Spiel</p>
          )}
          <div className="mt-2 flex -space-x-2">
            {team.members.slice(0, 6).map((m) => (
              <Avatar key={m.id} name={m.displayName} src={m.avatarUrl} size="xs" className="ring-2 ring-base-card" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
