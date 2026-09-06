import type { GameView, TeamView } from "@/lib/types";

export function applicableGames(games: GameView[], side: "A" | "B") {
  return games.filter((g) => g.appliesTo === "BOTH" || g.appliesTo === `TEAM_${side}`);
}

/** Aktuelles Spiel eines Teams: explizite Auswahl, sonst zuletzt aktives, sonst erstes offene Spiel. */
export function deriveCurrentGame(team: TeamView, games: GameView[]): GameView | null {
  const relevant = applicableGames(games, team.side);
  if (team.currentGameId) {
    const explicit = relevant.find((g) => g.id === team.currentGameId);
    if (explicit && explicit.progress[team.id]?.status !== "COMPLETED") return explicit;
  }
  const active = relevant
    .filter((g) => g.progress[team.id]?.status === "ACTIVE")
    .sort((a, b) => {
      const aTime = a.progress[team.id]?.lastUpdatedAt ? new Date(a.progress[team.id]!.lastUpdatedAt!).getTime() : 0;
      const bTime = b.progress[team.id]?.lastUpdatedAt ? new Date(b.progress[team.id]!.lastUpdatedAt!).getTime() : 0;
      return bTime - aTime;
    });
  if (active[0]) return active[0];
  return relevant.find((g) => g.progress[team.id]?.status !== "COMPLETED") ?? null;
}

export interface TeamProgressSummary {
  overallPercent: number;
  completedGames: number;
  totalGames: number;
  totalWins: number;
  remainingWins: number;
}

export function summarizeTeamProgress(team: TeamView, games: GameView[]): TeamProgressSummary {
  const relevant = applicableGames(games, team.side);
  let valueSum = 0;
  let targetSum = 0;
  let completedGames = 0;
  let totalWins = 0;
  let remainingWins = 0;

  for (const g of relevant) {
    const p = g.progress[team.id];
    const value = p?.value ?? 0;
    valueSum += value;
    targetSum += g.targetValue;
    if (p?.status === "COMPLETED") completedGames += 1;
    if (g.progressType === "WINS") {
      totalWins += value;
      if (p?.status !== "COMPLETED") remainingWins += g.targetValue - value;
    }
  }

  return {
    overallPercent: targetSum > 0 ? Math.round((valueSum / targetSum) * 100) : 0,
    completedGames,
    totalGames: relevant.length,
    totalWins,
    remainingWins,
  };
}
