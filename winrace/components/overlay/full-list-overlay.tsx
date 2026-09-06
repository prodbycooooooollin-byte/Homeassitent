import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ChallengeView, TeamView } from "@/lib/types";

const STATUS_ICON = { PENDING: Circle, ACTIVE: Loader2, COMPLETED: CheckCircle2 } as const;

export function FullListOverlay({ teams, challenge }: { teams: TeamView[]; challenge: ChallengeView }) {
  const [teamA, teamB] = teams;
  if (!teamA || !teamB) return null;

  return (
    <div className="w-full max-w-2xl space-y-2 rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-md motion-safe:animate-fade-in">
      {challenge.games.map((game) => {
        const done = [teamA, teamB].every((t) => game.progress[t.id]?.status === "COMPLETED" || (game.appliesTo !== "BOTH" && game.appliesTo !== `TEAM_${t.side}`));
        return (
          <div key={game.id} className="flex items-center justify-between gap-3 text-[0.85em]">
            <TeamMark team={teamA} game={game} />
            <span className={cn("flex-1 text-center font-medium text-white", done && "text-white/40 line-through")}>{game.name}</span>
            <TeamMark team={teamB} game={game} reverse />
          </div>
        );
      })}
    </div>
  );
}

function TeamMark({ team, game, reverse }: { team: TeamView; game: ChallengeView["games"][number]; reverse?: boolean }) {
  const applies = game.appliesTo === "BOTH" || game.appliesTo === `TEAM_${team.side}`;
  if (!applies) return <span className="w-16 text-white/20">–</span>;
  const p = game.progress[team.id];
  const Icon = STATUS_ICON[p?.status ?? "PENDING"];
  return (
    <span className={cn("flex w-16 items-center gap-1 tabular-nums", reverse && "flex-row-reverse")} style={{ color: team.color }}>
      <Icon className={cn("h-[0.9em] w-[0.9em]", p?.status === "ACTIVE" && "animate-spin")} />
      {p?.value ?? 0}/{game.targetValue}
    </span>
  );
}
