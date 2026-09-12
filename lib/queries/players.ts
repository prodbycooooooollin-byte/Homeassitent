import "server-only";
import { prisma } from "@/lib/db";
import { computeLeaderboard, type LeaderboardMetric } from "@/lib/stats/leaderboards";

export interface PlayerListEntry {
  uuid: string;
  username: string;
  isOnline: boolean;
  lastSeenAt: Date | null;
  firstSeenAt: Date | null;
  playtimeTicks: number | null;
}

export async function getPlayersList(): Promise<PlayerListEntry[]> {
  const accounts = await prisma.minecraftAccount.findMany({
    orderBy: [{ isOnline: "desc" }, { lastSeenAt: "desc" }],
    include: { statSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });

  return accounts.map((a) => ({
    uuid: a.uuid,
    username: a.username,
    isOnline: a.isOnline,
    lastSeenAt: a.lastSeenAt,
    firstSeenAt: a.firstSeenAt,
    playtimeTicks: a.statSnapshots[0]?.playtimeTicks ?? null,
  }));
}

export interface PlayerProfile {
  uuid: string;
  username: string;
  isOnline: boolean;
  lastSeenAt: Date | null;
  firstSeenAt: Date | null;
  linkedUserId: string | null;
  totals: { playtimeTicks: number; blocksMinedTotal: number; mobKillsTotal: number; deathsTotal: number } | null;
  blockStats: { blockKey: string; count: number }[];
  mobStats: { mobKey: string; kills: number }[];
  distanceStats: { type: string; cm: number }[];
  advancements: { advancementKey: string; unlockedAt: Date }[];
  ranks: Partial<Record<LeaderboardMetric, number>>;
  latestDeath: { occurredAt: Date; message: string | null; x: number | null; y: number | null; z: number | null; dimension: string | null } | null;
}

export async function getPlayerProfile(uuid: string, viewerUserId: string | null): Promise<PlayerProfile | null> {
  const account = await prisma.minecraftAccount.findUnique({
    where: { uuid },
    include: {
      statSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
      blockStats: { orderBy: { count: "desc" } },
      mobStats: { orderBy: { kills: "desc" } },
      distanceStats: true,
      advancements: { orderBy: { unlockedAt: "desc" } },
    },
  });
  if (!account) return null;

  const metrics: LeaderboardMetric[] = ["playtimeTicks", "blocksMinedTotal", "mobKillsTotal"];
  const ranks: Partial<Record<LeaderboardMetric, number>> = {};
  for (const metric of metrics) {
    const board = await computeLeaderboard(metric, "total");
    const entry = board.find((e) => e.minecraftAccountId === account.id);
    if (entry) ranks[metric] = entry.rank;
  }

  const isOwner = viewerUserId !== null && account.userId === viewerUserId;
  let latestDeath = null;
  if (isOwner) {
    const death = await prisma.deathEvent.findFirst({
      where: { minecraftAccountId: account.id },
      orderBy: { occurredAt: "desc" },
    });
    if (death) {
      latestDeath = {
        occurredAt: death.occurredAt,
        message: death.message,
        x: death.x,
        y: death.y,
        z: death.z,
        dimension: death.dimension,
      };
    }
  }

  return {
    uuid: account.uuid,
    username: account.username,
    isOnline: account.isOnline,
    lastSeenAt: account.lastSeenAt,
    firstSeenAt: account.firstSeenAt,
    linkedUserId: account.userId,
    totals: account.statSnapshots[0]
      ? {
          playtimeTicks: account.statSnapshots[0].playtimeTicks,
          blocksMinedTotal: account.statSnapshots[0].blocksMinedTotal,
          mobKillsTotal: account.statSnapshots[0].mobKillsTotal,
          deathsTotal: account.statSnapshots[0].deathsTotal,
        }
      : null,
    blockStats: account.blockStats,
    mobStats: account.mobStats,
    distanceStats: account.distanceStats,
    advancements: account.advancements,
    ranks,
    latestDeath,
  };
}
