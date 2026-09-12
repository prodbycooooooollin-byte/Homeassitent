import "server-only";
import { prisma } from "@/lib/db";
import { computeLeaderboard } from "@/lib/stats/leaderboards";

export interface WeeklyRecap {
  since: Date;
  mostActive: { username: string; uuid: string; playtimeTicks: number }[];
  blocksMined: number;
  mobKills: number;
  goalsCompleted: { title: string }[];
  newProjects: { title: string }[];
}

export async function getWeeklyRecap(serverId: string): Promise<WeeklyRecap> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [playtimeBoard, blocksBoard, mobsBoard, goalsCompleted, newProjects] = await Promise.all([
    computeLeaderboard("playtimeTicks", "week"),
    computeLeaderboard("blocksMinedTotal", "week"),
    computeLeaderboard("mobKillsTotal", "week"),
    prisma.serverGoal.findMany({ where: { serverId, completedAt: { gte: since } }, select: { title: true } }),
    prisma.buildProject.findMany({ where: { serverId, createdAt: { gte: since } }, select: { title: true } }),
  ]);

  return {
    since,
    mostActive: playtimeBoard
      .filter((e) => e.value > 0)
      .slice(0, 5)
      .map((e) => ({ username: e.username, uuid: e.uuid, playtimeTicks: e.value })),
    blocksMined: blocksBoard.reduce((sum, e) => sum + e.value, 0),
    mobKills: mobsBoard.reduce((sum, e) => sum + e.value, 0),
    goalsCompleted,
    newProjects,
  };
}
