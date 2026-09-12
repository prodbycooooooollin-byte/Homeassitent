import "server-only";
import { prisma } from "@/lib/db";
import type { GoalMetric } from "@/lib/constants";

const METRIC_FIELD: Record<GoalMetric, "playtimeTicks" | "blocksMinedTotal" | "mobKillsTotal" | "deathsTotal"> = {
  PLAYTIME_HOURS: "playtimeTicks",
  BLOCKS_MINED: "blocksMinedTotal",
  MOB_KILLS: "mobKillsTotal",
  DEATHS: "deathsTotal",
};

export interface GoalProgress {
  id: string;
  title: string;
  description: string | null;
  metric: GoalMetric;
  target: number;
  current: number;
  startAt: Date;
  completedAt: Date | null;
}

/**
 * Serverweiter Fortschritt seit startAt, berechnet aus den tatsächlich
 * gemeldeten PlayerStatSnapshot-Deltas jedes Spielers (gleiche
 * Baseline-Logik wie bei Ranglisten - siehe lib/stats/leaderboards.ts),
 * über alle Spieler summiert. Nie ein statischer/manueller Wert.
 */
export async function getGoalsWithProgress(serverId: string): Promise<GoalProgress[]> {
  const goals = await prisma.serverGoal.findMany({
    where: { serverId },
    orderBy: { createdAt: "desc" },
  });
  if (goals.length === 0) return [];

  const snapshots = await prisma.playerStatSnapshot.findMany({ orderBy: { capturedAt: "asc" } });
  const byAccount = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    const list = byAccount.get(s.minecraftAccountId);
    if (list) list.push(s);
    else byAccount.set(s.minecraftAccountId, [s]);
  }

  return goals.map((goal) => {
    const field = METRIC_FIELD[goal.metric as GoalMetric];
    let sum = 0;
    for (const list of byAccount.values()) {
      const latest = list[list.length - 1];
      const baseline = [...list].reverse().find((s) => s.capturedAt <= goal.startAt) ?? list[0];
      sum += Math.max(0, latest[field] - baseline[field]);
    }
    const current = goal.metric === "PLAYTIME_HOURS" ? sum / (20 * 3600) : sum;

    return {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      metric: goal.metric as GoalMetric,
      target: goal.target,
      current,
      startAt: goal.startAt,
      completedAt: goal.completedAt,
    };
  });
}
