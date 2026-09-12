import "server-only";
import { prisma } from "@/lib/db";
import { pingServer } from "@/lib/minecraft/slp";
import type { MinecraftServer } from "@prisma/client";

export interface LiveStatus {
  online: boolean;
  /** Zeitpunkt der letzten ERFOLGREICHEN Statusabfrage. */
  asOf: Date | null;
  motd: string | null;
  versionName: string | null;
  playersOnline: number | null;
  playersMax: number | null;
  latencyMs: number | null;
  /** true = die unten stehenden Werte sind älter als der aktuelle Check (Verbindung gerade unterbrochen). */
  stale: boolean;
}

// Verhindert, dass viele Seitenaufrufe kurz hintereinander jeweils eine
// eigene TCP-Verbindung zum Minecraft-Server aufbauen (Lastminimierung).
const THROTTLE_MS = 15_000;
const lastAttemptByServer = new Map<string, number>();

/**
 * Liefert den aktuellen Serverstatus per Server-List-Ping. Bei Erfolg werden
 * die Felder in der DB aktualisiert; bei Misserfolg bleiben die zuletzt
 * bekannten Werte erhalten und nur `online` wird auf false gesetzt - siehe
 * Anforderung "zuletzt bekannte Daten bleiben sichtbar, mit Zeitpunkt".
 */
export async function getLiveServerStatus(server: MinecraftServer): Promise<LiveStatus> {
  const lastAttempt = lastAttemptByServer.get(server.id) ?? 0;
  const shouldCheck = Date.now() - lastAttempt > THROTTLE_MS;

  let current = server;

  if (shouldCheck) {
    lastAttemptByServer.set(server.id, Date.now());
    try {
      const result = await pingServer(server.host, server.port, 4000);
      current = await prisma.minecraftServer.update({
        where: { id: server.id },
        data: {
          lastSlpCheckAt: new Date(),
          lastSlpOnline: true,
          lastSlpPlayers: result.playersOnline,
          lastSlpMaxPlayers: result.playersMax,
          lastSlpMotd: result.motd,
          lastSlpVersion: result.versionName,
          lastSlpLatencyMs: result.latencyMs,
        },
      });
      await prisma.statusSnapshot.create({
        data: {
          serverId: server.id,
          online: true,
          playersOnline: result.playersOnline,
          playersMax: result.playersMax,
          motd: result.motd,
          latencyMs: result.latencyMs,
          source: "SLP",
        },
      });
    } catch {
      current = await prisma.minecraftServer.update({
        where: { id: server.id },
        data: { lastSlpOnline: false },
      });
      // Offline-Zustand ebenfalls für das Aktivitätsdiagramm festhalten.
      await prisma.statusSnapshot.create({
        data: { serverId: server.id, online: false, source: "SLP" },
      });
    }
  }

  const stale = current.lastSlpOnline !== true;

  return {
    online: current.lastSlpOnline === true,
    asOf: current.lastSlpCheckAt,
    motd: current.lastSlpMotd,
    versionName: current.lastSlpVersion,
    playersOnline: current.lastSlpPlayers,
    playersMax: current.lastSlpMaxPlayers,
    latencyMs: current.lastSlpLatencyMs,
    stale,
  };
}
