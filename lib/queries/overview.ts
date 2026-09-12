import "server-only";
import { prisma } from "@/lib/db";
import { getLiveServerStatus } from "@/lib/minecraft/live-status";
import { getConnectionLevel, type ConnectionLevel } from "@/lib/server-context";
import type { MinecraftServer } from "@prisma/client";

export interface OverviewData {
  server: {
    id: string;
    name: string;
    host: string;
    port: number;
    minecraftVersion: string;
    platform: string;
    foundedAt: Date | null;
    lastStartedAt: Date | null;
  };
  connectionLevel: ConnectionLevel;
  status: {
    online: boolean;
    stale: boolean;
    asOf: Date | null;
    motd: string | null;
    latencyMs: number | null;
  };
  players: {
    online: number | null;
    max: number | null;
    /** Nur befüllt, wenn der Connector-Agent läuft (vollständige Anbindung). */
    onlineList: { uuid: string; username: string }[] | null;
  };
  totals: {
    /** null = noch keine einzige Statistik-Meldung erhalten. */
    dataSince: Date | null;
    playtimeTicks: number;
    blocksMined: number;
    mobKills: number;
    deaths: number;
    trackedPlayers: number;
  };
  modpack: { name: string; versionNumber: string } | null;
  activityDays: { date: string; activePlayers: number }[];
}

const ACTIVITY_DAYS = 30;

export async function getOverviewData(server: MinecraftServer): Promise<OverviewData> {
  const connectionLevel = getConnectionLevel(server);
  const status = await getLiveServerStatus(server);

  const fullyConnected = connectionLevel === "full";

  const onlineAccounts = fullyConnected
    ? await prisma.minecraftAccount.findMany({
        where: { isOnline: true },
        select: { uuid: true, username: true },
        orderBy: { username: "asc" },
      })
    : null;

  const latestSnapshots = await prisma.playerStatSnapshot.findMany({
    distinct: ["minecraftAccountId"],
    orderBy: { capturedAt: "desc" },
  });
  const totals = latestSnapshots.reduce(
    (acc, s) => ({
      playtimeTicks: acc.playtimeTicks + s.playtimeTicks,
      blocksMined: acc.blocksMined + s.blocksMinedTotal,
      mobKills: acc.mobKills + s.mobKillsTotal,
      deaths: acc.deaths + s.deathsTotal,
    }),
    { playtimeTicks: 0, blocksMined: 0, mobKills: 0, deaths: 0 },
  );
  const earliestSnapshot = await prisma.playerStatSnapshot.findFirst({
    orderBy: { capturedAt: "asc" },
  });

  const currentModpack = await prisma.modpack.findFirst({
    where: { serverId: server.id },
    include: { versions: { where: { isCurrent: true }, take: 1 } },
  });

  const since = new Date(Date.now() - ACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  const sessions = await prisma.playerSession.findMany({
    where: { joinedAt: { gte: since } },
    select: { minecraftAccountId: true, joinedAt: true, leftAt: true },
  });
  const activityDays = buildActivityDays(sessions, ACTIVITY_DAYS);

  return {
    server: {
      id: server.id,
      name: server.name,
      host: server.host,
      port: server.port,
      minecraftVersion: server.minecraftVersion,
      platform: server.platform,
      foundedAt: server.foundedAt,
      lastStartedAt: server.lastStartedAt,
    },
    connectionLevel,
    status: {
      online: status.online,
      stale: status.stale,
      asOf: status.asOf,
      motd: status.motd,
      latencyMs: status.latencyMs,
    },
    players: {
      online: fullyConnected ? (onlineAccounts?.length ?? 0) : status.playersOnline,
      max: status.playersMax,
      onlineList: onlineAccounts,
    },
    totals: {
      dataSince: earliestSnapshot?.capturedAt ?? null,
      trackedPlayers: latestSnapshots.length,
      ...totals,
    },
    modpack: currentModpack?.versions[0]
      ? { name: currentModpack.name, versionNumber: currentModpack.versions[0].versionNumber }
      : null,
    activityDays,
  };
}

function buildActivityDays(
  sessions: { minecraftAccountId: string; joinedAt: Date; leftAt: Date | null }[],
  days: number,
): { date: string; activePlayers: number }[] {
  const buckets: { date: string; players: Set<string> }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    buckets.push({ date: day.toISOString().slice(0, 10), players: new Set() });
  }

  for (const session of sessions) {
    const start = session.joinedAt;
    const end = session.leftAt ?? new Date();
    for (const bucket of buckets) {
      const bucketStart = new Date(bucket.date + "T00:00:00");
      const bucketEnd = new Date(bucket.date + "T23:59:59.999");
      if (start <= bucketEnd && end >= bucketStart) {
        bucket.players.add(session.minecraftAccountId);
      }
    }
  }

  return buckets.map((b) => ({ date: b.date, activePlayers: b.players.size }));
}
