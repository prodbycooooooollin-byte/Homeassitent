import { prisma } from "@/lib/prisma";

/**
 * Berechnet ausschließlich Statistiken, die sich direkt aus vorhandenen
 * Daten ableiten lassen – keine erfundenen/geschätzten Werte. Wo die
 * Datenlage nicht ausreicht (z.B. Prognose mit < 2 abgeschlossenen
 * Spielen), wird `null` zurückgegeben; die UI zeigt dafür einen Empty
 * State statt einer Zahl.
 */

export interface TeamStats {
  teamId: string;
  side: "A" | "B";
  name: string;
  color: string;
  overallPercent: number;
  completedGames: number;
  totalApplicableGames: number;
  totalWins: number;
  remainingWins: number;
  currentStreak: number;
  averageTimePerGameMs: number | null;
  fastestGame: { gameId: string; name: string; durationMs: number } | null;
  lastWinAt: Date | null;
  mostActiveMember: { userId: string; displayName: string; actionCount: number } | null;
  etaMs: number | null;
  timeline: { gameId: string; gameName: string; completedAt: Date }[];
}

export interface RoomStats {
  teams: TeamStats[];
  leadingTeamId: string | null;
  leadMarginPercent: number | null;
}

export async function computeRoomStats(roomId: string): Promise<RoomStats | null> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      teams: true,
      challenge: { include: { games: { orderBy: { order: "asc" } } } },
    },
  });
  if (!room || !room.challenge) return null;

  const games = room.challenge.games;
  const teamStats: TeamStats[] = [];

  for (const team of room.teams) {
    const applicableGames = games.filter((g) => g.appliesTo === "BOTH" || g.appliesTo === `TEAM_${team.side}`);
    const progressRows = await prisma.teamGameProgress.findMany({
      where: { teamId: team.id, gameId: { in: applicableGames.map((g) => g.id) } },
    });
    const byGameId = new Map(progressRows.map((p) => [p.gameId, p]));

    let valueSum = 0;
    let targetSum = 0;
    let winsTotal = 0;
    let winsRemaining = 0;
    let completedGames = 0;
    const durations: number[] = [];
    let fastestGame: TeamStats["fastestGame"] = null;
    const timeline: TeamStats["timeline"] = [];

    for (const game of applicableGames) {
      const progress = byGameId.get(game.id);
      const value = progress?.value ?? 0;
      valueSum += value;
      targetSum += game.targetValue;

      if (game.progressType === "WINS") {
        winsTotal += value;
        if (progress?.status !== "COMPLETED") winsRemaining += game.targetValue - value;
      }

      if (progress?.status === "COMPLETED") {
        completedGames += 1;
        timeline.push({ gameId: game.id, gameName: game.name, completedAt: progress.completedAt! });
        if (progress.startedAt && progress.completedAt) {
          const duration = progress.completedAt.getTime() - progress.startedAt.getTime();
          durations.push(duration);
          if (!fastestGame || duration < fastestGame.durationMs) {
            fastestGame = { gameId: game.id, name: game.name, durationMs: duration };
          }
        }
      }
    }

    // Aktuelle Serie: längster geschlossener Präfix (nach Reihenfolge) an
    // abgeschlossenen Spielen ab dem ersten Eintrag der Liste.
    let currentStreak = 0;
    for (const game of applicableGames) {
      if (byGameId.get(game.id)?.status === "COMPLETED") currentStreak += 1;
      else break;
    }

    timeline.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
    const lastWinAt = timeline.length > 0 ? timeline[timeline.length - 1].completedAt : null;

    const averageTimePerGameMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    const remainingGamesCount = applicableGames.length - completedGames;
    const etaMs = durations.length >= 2 && remainingGamesCount > 0 ? averageTimePerGameMs! * remainingGamesCount : null;

    const activeMemberRows = await prisma.teamGameProgressLog.groupBy({
      by: ["actorId"],
      where: { actorId: { not: null }, progress: { teamId: team.id, gameId: { in: applicableGames.map((g) => g.id) } } },
      _count: { actorId: true },
      orderBy: { _count: { actorId: "desc" } },
      take: 1,
    });
    let mostActiveMember: TeamStats["mostActiveMember"] = null;
    if (activeMemberRows.length > 0 && activeMemberRows[0].actorId) {
      const user = await prisma.user.findUnique({ where: { id: activeMemberRows[0].actorId } });
      if (user) {
        mostActiveMember = { userId: user.id, displayName: user.displayName, actionCount: activeMemberRows[0]._count.actorId };
      }
    }

    teamStats.push({
      teamId: team.id,
      side: team.side,
      name: team.name,
      color: team.color,
      overallPercent: targetSum > 0 ? Math.round((valueSum / targetSum) * 100) : 0,
      completedGames,
      totalApplicableGames: applicableGames.length,
      totalWins: winsTotal,
      remainingWins: winsRemaining,
      currentStreak,
      averageTimePerGameMs,
      fastestGame,
      lastWinAt,
      mostActiveMember,
      etaMs,
      timeline,
    });
  }

  let leadingTeamId: string | null = null;
  let leadMarginPercent: number | null = null;
  if (teamStats.length === 2) {
    const [a, b] = teamStats;
    const diff = a.overallPercent - b.overallPercent;
    if (diff !== 0) {
      leadingTeamId = diff > 0 ? a.teamId : b.teamId;
      leadMarginPercent = Math.abs(diff);
    }
  }

  return { teams: teamStats, leadingTeamId, leadMarginPercent };
}
