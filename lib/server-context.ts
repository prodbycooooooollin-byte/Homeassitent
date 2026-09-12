import "server-only";
import { prisma } from "@/lib/db";

/**
 * Craftboard verwaltet aktuell genau einen Minecraft-Server. Diese Funktion
 * ist die einzige Stelle, die das annimmt - eine spätere
 * Mehrserver-Unterstützung müsste nur hier ansetzen.
 */
export async function getPrimaryServer() {
  return prisma.minecraftServer.findFirst({ orderBy: { createdAt: "asc" } });
}

export async function getAppSettings() {
  return prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", demoModeEnabled: true },
  });
}

export type ConnectionLevel = "none" | "basic" | "full";

/**
 * "basic"  = Server-List-Ping erfolgreich (Adresse erreichbar), aber kein
 *            Connector-Agent hat sich je gemeldet.
 * "full"   = Connector-Agent hat sich innerhalb der letzten 10 Minuten gemeldet
 *            (RCON/Statistikdateien/Log-Tailing verfügbar).
 * "none"   = noch kein Server eingerichtet.
 */
export function getConnectionLevel(server: {
  lastSlpCheckAt: Date | null;
  lastAgentContactAt: Date | null;
} | null): ConnectionLevel {
  if (!server) return "none";
  if (server.lastAgentContactAt && Date.now() - server.lastAgentContactAt.getTime() < 10 * 60 * 1000) {
    return "full";
  }
  if (server.lastSlpCheckAt) return "basic";
  return "none";
}

/**
 * Demo-Modus greift, wenn (a) noch kein Server eingerichtet ist, oder
 * (b) ein Admin ihn global aktiviert hat - z. B. um die Oberfläche mit
 * Beispieldaten vorzuführen, ohne echte Serverdaten zu verändern.
 */
export async function resolveDemoMode(): Promise<{
  demoMode: boolean;
  server: Awaited<ReturnType<typeof getPrimaryServer>>;
}> {
  const [server, settings] = await Promise.all([getPrimaryServer(), getAppSettings()]);
  // Vor Abschluss des Einrichtungsassistenten gibt es zwangsläufig keine
  // echten Daten -> immer Demo-Modus. Danach entscheidet der globale,
  // vom Admin gesetzte Schalter (wird beim Abschluss der Einrichtung
  // automatisch deaktiviert, siehe completeSetupAction).
  const demoMode = !server || !server.setupCompletedAt ? true : settings.demoModeEnabled;
  return { demoMode, server };
}
