import { CheckCircle2, Circle, Loader2, Star } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PROGRESS_TYPE_UNIT } from "@/lib/labels";
import { cn } from "@/lib/cn";
import type { GameView, TeamView } from "@/lib/types";

const STATUS_ICON = { PENDING: Circle, ACTIVE: Loader2, COMPLETED: CheckCircle2 } as const;

function TeamCell({ team, game }: { team: TeamView; game: GameView }) {
  const applies = game.appliesTo === "BOTH" || game.appliesTo === `TEAM_${team.side}`;
  if (!applies) {
    return <div className="flex-1 text-center text-xs text-ink-faint">–</div>;
  }
  const p = game.progress[team.id];
  const percent = game.targetValue > 0 ? ((p?.value ?? 0) / game.targetValue) * 100 : 0;
  const StatusIcon = STATUS_ICON[p?.status ?? "PENDING"];

  return (
    <div className="flex-1">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 font-medium" style={{ color: team.color }}>
          <StatusIcon className={cn("h-3 w-3", p?.status === "ACTIVE" && "animate-spin")} />
          {p?.value ?? 0}/{game.targetValue}
        </span>
      </div>
      <ProgressBar percent={percent} color={team.color} height={8} />
    </div>
  );
}

export function LiveGameRow({ game, teams }: { game: GameView; teams: TeamView[] }) {
  const allCompleted = teams.every((t) => game.progress[t.id]?.status === "COMPLETED" || (game.appliesTo !== "BOTH" && game.appliesTo !== `TEAM_${t.side}`));

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-xl border border-base-border px-4 py-3">
      <TeamCell team={teams[0]} game={game} />
      <div className="w-40 shrink-0 text-center">
        <p className={cn("truncate text-sm font-semibold text-ink", allCompleted && "text-ink-faint line-through decoration-2")}>{game.name}</p>
        <p className="flex items-center justify-center gap-1 text-[11px] text-ink-faint">
          {PROGRESS_TYPE_UNIT[game.progressType]}
          {game.difficulty && (
            <span className="inline-flex">
              {Array.from({ length: game.difficulty }).map((_, i) => (
                <Star key={i} className="h-2.5 w-2.5 fill-warning text-warning" />
              ))}
            </span>
          )}
        </p>
      </div>
      <TeamCell team={teams[1]} game={game} />
    </div>
  );
}
