import "server-only";
import { prisma } from "@/lib/db";
import type { SnapshotPayload } from "@/lib/ingest/schemas";
import type { MinecraftServer } from "@prisma/client";
import { publishMapEvent } from "@/lib/realtime/bus";

/**
 * Wendet eine periodische Meldung des Connector-Agents an. Wird bewusst
 * NICHT in einer einzigen riesigen Transaktion mit dem Server-Update
 * verpackt - bei einer sehr kleinen Freundesgruppe ist die Datenmenge
 * gering, ein Teilausfall mitten in der Verarbeitung ist unkritisch
 * (nächste Meldung in wenigen Minuten korrigiert den Stand).
 */
export async function applySnapshot(server: MinecraftServer, payload: SnapshotPayload) {
  const capturedAt = payload.capturedAt ? new Date(payload.capturedAt) : new Date();

  for (const p of payload.players) {
    const existing = await prisma.minecraftAccount.findUnique({ where: { uuid: p.uuid } });

    const positionFields = p.position
      ? {
          posX: p.position.x,
          posY: p.position.y,
          posZ: p.position.z,
          posDimension: p.position.dimension,
          posUpdatedAt: capturedAt,
        }
      : {};

    const account = existing
      ? await prisma.minecraftAccount.update({
          where: { uuid: p.uuid },
          data: {
            username: p.username,
            isOnline: p.online,
            lastSeenAt: p.online ? capturedAt : existing.lastSeenAt,
            ...positionFields,
          },
        })
      : await prisma.minecraftAccount.create({
          data: {
            uuid: p.uuid,
            username: p.username,
            isOnline: p.online,
            firstSeenAt: p.firstSeenAt ? new Date(p.firstSeenAt) : capturedAt,
            lastSeenAt: capturedAt,
            ...positionFields,
          },
        });

    if (!existing) {
      await prisma.serverEvent.create({
        data: {
          serverId: server.id,
          occurredAt: account.firstSeenAt ?? capturedAt,
          type: "PLAYER_FIRST_JOIN",
          title: `${p.username} ist dem Server zum ersten Mal beigetreten`,
          isAutomatic: true,
        },
      });
    }

    if (
      p.playtimeTicks !== undefined &&
      p.blocksMinedTotal !== undefined &&
      p.mobKillsTotal !== undefined &&
      p.deathsTotal !== undefined
    ) {
      await prisma.playerStatSnapshot.create({
        data: {
          minecraftAccountId: account.id,
          capturedAt,
          playtimeTicks: p.playtimeTicks,
          blocksMinedTotal: p.blocksMinedTotal,
          mobKillsTotal: p.mobKillsTotal,
          deathsTotal: p.deathsTotal,
        },
      });
    }

    for (const [blockKey, count] of Object.entries(p.blocks ?? {})) {
      await prisma.playerBlockStat.upsert({
        where: { minecraftAccountId_blockKey: { minecraftAccountId: account.id, blockKey } },
        update: { count },
        create: { minecraftAccountId: account.id, blockKey, count },
      });
    }

    for (const [mobKey, kills] of Object.entries(p.mobs ?? {})) {
      await prisma.playerMobStat.upsert({
        where: { minecraftAccountId_mobKey: { minecraftAccountId: account.id, mobKey } },
        update: { kills },
        create: { minecraftAccountId: account.id, mobKey, kills },
      });
    }

    for (const [type, cm] of Object.entries(p.distances ?? {})) {
      await prisma.playerDistanceStat.upsert({
        where: { minecraftAccountId_type: { minecraftAccountId: account.id, type } },
        update: { cm },
        create: { minecraftAccountId: account.id, type, cm },
      });
    }

    for (const adv of p.advancements ?? []) {
      const already = await prisma.playerAdvancement.findUnique({
        where: {
          minecraftAccountId_advancementKey: {
            minecraftAccountId: account.id,
            advancementKey: adv.key,
          },
        },
      });
      if (already) continue;
      const unlockedAt = new Date(adv.unlockedAt);
      await prisma.playerAdvancement.create({
        data: { minecraftAccountId: account.id, advancementKey: adv.key, unlockedAt },
      });
      await prisma.serverEvent.create({
        data: {
          serverId: server.id,
          occurredAt: unlockedAt,
          type: "ADVANCEMENT",
          title: `${p.username}: Fortschritt „${adv.key}“ freigeschaltet`,
          isAutomatic: true,
        },
      });
    }
  }

  const onlineCount = payload.players.filter((p) => p.online).length;

  await prisma.$transaction([
    prisma.minecraftServer.update({
      where: { id: server.id },
      data: {
        lastAgentContactAt: new Date(),
        reportedCapabilities: JSON.stringify(payload.capabilities),
      },
    }),
    prisma.statusSnapshot.create({
      data: {
        serverId: server.id,
        capturedAt,
        online: true,
        playersOnline: onlineCount,
        playersMax: payload.maxPlayers ?? null,
        source: "AGENT",
      },
    }),
    ...(payload.health
      ? [
          prisma.serverHealthSnapshot.create({
            data: {
              serverId: server.id,
              capturedAt,
              tps: payload.health.tps,
              tickTimeMs: payload.health.tickTimeMs,
              memoryUsedMb: payload.health.memoryUsedMb,
              memoryMaxMb: payload.health.memoryMaxMb,
              playerCount: onlineCount,
            },
          }),
        ]
      : []),
  ]);

  if (payload.players.some((p) => p.position)) {
    publishMapEvent({ kind: "players.update" });
  }
}
