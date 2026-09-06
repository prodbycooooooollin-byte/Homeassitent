import { deriveCurrentGame } from "@/lib/client/derive";
import { PROGRESS_TYPE_UNIT } from "@/lib/labels";
import type { ChallengeView, TeamView } from "@/lib/types";

export function CurrentGameOverlay({ teams, challenge }: { teams: TeamView[]; challenge: ChallengeView }) {
  const [teamA, teamB] = teams;
  if (!teamA || !teamB) return null;
  const gameA = deriveCurrentGame(teamA, challenge.games);
  const gameB = deriveCurrentGame(teamB, challenge.games);

  return (
    <div className="grid w-full max-w-3xl grid-cols-2 gap-4 motion-safe:animate-fade-in">
      {[
        { team: teamA, game: gameA },
        { team: teamB, game: gameB },
      ].map(({ team, game }) => (
        <div key={team.id} className="rounded-2xl border border-white/10 bg-black/40 p-5 text-center backdrop-blur-md">
          <p className="text-[0.7em] uppercase tracking-widest text-white/50">{team.name}</p>
          {game ? (
            <>
              <p className="mt-1 text-[1.6em] font-display font-extrabold text-white">{game.name}</p>
              <p className="mt-1 text-[1.1em] font-bold tabular-nums" style={{ color: team.color }}>
                {game.progress[team.id]?.value ?? 0}/{game.targetValue} {PROGRESS_TYPE_UNIT[game.progressType]}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[1.1em] text-white/40">Kein aktives Spiel</p>
          )}
        </div>
      ))}
    </div>
  );
}
