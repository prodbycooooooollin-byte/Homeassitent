import { summarizeTeamProgress } from "@/lib/client/derive";
import { formatDuration } from "@/lib/time";
import type { ChallengeView, TeamView } from "@/lib/types";
import type { OverlayConfigInput } from "@/lib/validation";

export function CompactOverlay({ teams, challenge, config }: { teams: TeamView[]; challenge: ChallengeView; config: OverlayConfigInput }) {
  const [teamA, teamB] = teams;
  if (!teamA || !teamB) return null;
  const a = summarizeTeamProgress(teamA, challenge.games);
  const b = summarizeTeamProgress(teamB, challenge.games);

  return (
    <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/50 px-5 py-2.5 backdrop-blur-md motion-safe:animate-fade-in">
      <span className="text-[1em] font-display font-bold" style={{ color: teamA.color }}>
        {teamA.name}
      </span>
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${a.overallPercent}%`, background: teamA.color }} />
      </div>
      <span className="text-[0.8em] tabular-nums text-white/60">{a.overallPercent}%</span>
      {config.showTimer && <span className="text-[0.8em] tabular-nums text-white/40">{formatDuration(challenge.elapsedMs)}</span>}
      <span className="text-[0.8em] tabular-nums text-white/60">{b.overallPercent}%</span>
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
        <div className="ml-auto h-full rounded-full" style={{ width: `${b.overallPercent}%`, background: teamB.color }} />
      </div>
      <span className="text-[1em] font-display font-bold" style={{ color: teamB.color }}>
        {teamB.name}
      </span>
    </div>
  );
}
