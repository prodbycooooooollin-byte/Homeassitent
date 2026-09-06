import { Avatar } from "@/components/ui/avatar";
import { ProgressRing } from "@/components/ui/progress-ring";
import { deriveCurrentGame, summarizeTeamProgress } from "@/lib/client/derive";
import { PROGRESS_TYPE_UNIT } from "@/lib/labels";
import { formatDuration } from "@/lib/time";
import type { ChallengeView, TeamView } from "@/lib/types";
import type { OverlayConfigInput } from "@/lib/validation";

function TeamBlock({ team, games, config, align }: { team: TeamView; games: ChallengeView["games"]; config: OverlayConfigInput; align: "left" | "right" }) {
  const summary = summarizeTeamProgress(team, games);
  const currentGame = deriveCurrentGame(team, games);
  const p = currentGame?.progress[team.id];

  return (
    <div className={`flex flex-1 flex-col gap-3 ${align === "right" ? "items-end text-right" : "items-start text-left"}`}>
      <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <ProgressRing percent={summary.overallPercent} color={team.color} size={64} strokeWidth={6} />
        <div>
          <p className="text-[1.6em] font-display font-extrabold leading-tight drop-shadow-lg" style={{ color: team.color }}>
            {team.name}
          </p>
          <p className="text-[0.7em] text-white/70">
            {summary.completedGames}/{summary.totalGames} Spiele
          </p>
        </div>
      </div>
      {currentGame && (
        <p className="text-[0.85em] font-medium text-white/90">
          {currentGame.name} · {p?.value ?? 0}/{currentGame.targetValue} {PROGRESS_TYPE_UNIT[currentGame.progressType]}
        </p>
      )}
      {config.showMemberAvatars && (
        <div className={`flex -space-x-2 ${align === "right" ? "flex-row-reverse space-x-reverse" : ""}`}>
          {team.members.map((m) => (
            <Avatar key={m.id} name={m.displayName} src={m.avatarUrl} size="sm" ring="#050509" />
          ))}
        </div>
      )}
    </div>
  );
}

export function TeamComparisonOverlay({ teams, challenge, config }: { teams: TeamView[]; challenge: ChallengeView; config: OverlayConfigInput }) {
  const [teamA, teamB] = teams;
  if (!teamA || !teamB) return null;

  return (
    <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-md motion-safe:animate-fade-in">
      <div className="flex items-center gap-6">
        <TeamBlock team={teamA} games={challenge.games} config={config} align="left" />
        <div className="text-[1.1em] font-display font-black text-white/40">VS</div>
        <TeamBlock team={teamB} games={challenge.games} config={config} align="right" />
      </div>
      {config.showTimer && (
        <p className="mt-4 text-center text-[0.75em] tabular-nums text-white/50">{formatDuration(challenge.elapsedMs)}</p>
      )}
    </div>
  );
}
