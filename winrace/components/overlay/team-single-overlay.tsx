import { Avatar } from "@/components/ui/avatar";
import { ProgressRing } from "@/components/ui/progress-ring";
import { deriveCurrentGame, summarizeTeamProgress } from "@/lib/client/derive";
import { PROGRESS_TYPE_UNIT } from "@/lib/labels";
import type { ChallengeView, TeamView } from "@/lib/types";
import type { OverlayConfigInput } from "@/lib/validation";

export function TeamSingleOverlay({ team, games, config }: { team: TeamView; games: ChallengeView["games"]; config: OverlayConfigInput }) {
  const summary = summarizeTeamProgress(team, games);
  const currentGame = deriveCurrentGame(team, games);
  const p = currentGame?.progress[team.id];

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-md motion-safe:animate-fade-in">
      <ProgressRing percent={summary.overallPercent} color={team.color} size={80} strokeWidth={7} />
      <div>
        <p className="text-[1.8em] font-display font-extrabold leading-tight" style={{ color: team.color }}>
          {team.name}
        </p>
        <p className="text-[0.75em] text-white/70">
          {summary.completedGames}/{summary.totalGames} Spiele · {summary.totalWins} Siege
        </p>
        {currentGame && (
          <p className="mt-1 text-[0.9em] font-medium text-white/90">
            {currentGame.name} · {p?.value ?? 0}/{currentGame.targetValue} {PROGRESS_TYPE_UNIT[currentGame.progressType]}
          </p>
        )}
        {config.showMemberAvatars && (
          <div className="mt-2 flex -space-x-2">
            {team.members.map((m) => (
              <Avatar key={m.id} name={m.displayName} src={m.avatarUrl} size="sm" ring="#050509" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
