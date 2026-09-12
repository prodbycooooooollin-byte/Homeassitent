import { DEMO_PERSONAS } from "@/lib/demo/personas";
import type { LeaderboardEntry, LeaderboardMetric, LeaderboardPeriod } from "@/lib/stats/leaderboards";
import type { GoalProgress } from "@/lib/stats/goals";

const BASE: Record<LeaderboardMetric, number[]> = {
  playtimeTicks: [820000, 640000, 510000, 430000, 300000, 210000, 150000, 40000],
  blocksMinedTotal: [38210, 29450, 24110, 19870, 15200, 9800, 6100, 1200],
  mobKillsTotal: [1420, 1180, 990, 860, 640, 410, 250, 60],
  deathsTotal: [88, 102, 64, 130, 45, 30, 22, 5],
};

const PERIOD_SCALE: Record<LeaderboardPeriod, number> = { total: 1, week: 0.04, month: 0.15 };

export function getDemoLeaderboard(metric: LeaderboardMetric, period: LeaderboardPeriod): LeaderboardEntry[] {
  const scale = PERIOD_SCALE[period];
  const entries = DEMO_PERSONAS.map((p, i) => ({
    minecraftAccountId: p.uuid,
    uuid: p.uuid,
    username: p.username,
    value: Math.round(BASE[metric][i] * scale),
  }));
  entries.sort((a, b) => b.value - a.value);
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}

export function getDemoGoals(): GoalProgress[] {
  return [
    {
      id: "demo-goal-1",
      title: "1 Million Blöcke abbauen",
      description: "Gemeinsames Season-3-Ziel",
      metric: "BLOCKS_MINED",
      target: 1_000_000,
      current: 284_913,
      startAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      completedAt: null,
    },
    {
      id: "demo-goal-2",
      title: "10.000 Mobs besiegen",
      description: null,
      metric: "MOB_KILLS",
      target: 10_000,
      current: 12_847,
      startAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
  ];
}
