import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getPrimaryServer, getAppSettings } from "@/lib/server-context";
import { AccountSection } from "@/components/settings/account-section";
import { McLinkSection } from "@/components/settings/mc-link-section";
import { ServerConnectionPanel } from "@/components/settings/server-connection-panel";
import { MembersSection } from "@/components/settings/members-section";
import { DemoModeSection } from "@/components/settings/demo-mode-section";
import { ServerHealthSection } from "@/components/settings/server-health-section";
import type { Role } from "@/lib/constants";

export const metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const user = await requireUser();

  const [mcAccount, server, appSettings] = await Promise.all([
    prisma.minecraftAccount.findUnique({ where: { userId: user.id } }),
    getPrimaryServer(),
    getAppSettings(),
  ]);

  const isAdmin = user.role === "ADMIN";

  const [members, latestHealth] = await Promise.all([
    isAdmin
      ? prisma.user.findMany({
          orderBy: { createdAt: "asc" },
          include: { minecraftAccount: true },
        })
      : Promise.resolve([]),
    isAdmin && server
      ? prisma.serverHealthSnapshot.findFirst({
          where: { serverId: server.id },
          orderBy: { capturedAt: "desc" },
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Einstellungen</h1>
        <p className="text-sm text-ink-muted">Konto, Serververbindung und Verwaltung.</p>
      </div>

      <AccountSection user={user} />
      <McLinkSection
        account={
          mcAccount ? { uuid: mcAccount.uuid, username: mcAccount.username, linkedAt: mcAccount.updatedAt } : null
        }
      />

      {isAdmin && (
        <>
          <ServerConnectionPanel
            server={
              server
                ? {
                    id: server.id,
                    name: server.name,
                    host: server.host,
                    port: server.port,
                    minecraftVersion: server.minecraftVersion,
                    platform: server.platform,
                    foundedAt: server.foundedAt?.toISOString() ?? null,
                    rconPort: server.rconPort,
                    mapTileUrlTemplate: server.mapTileUrlTemplate,
                    hasRconPassword: !!server.rconPasswordEncrypted,
                    setupCompletedAt: server.setupCompletedAt?.toISOString() ?? null,
                    agentKeyGeneratedAt: server.agentKeyGeneratedAt?.toISOString() ?? null,
                    lastAgentContactAt: server.lastAgentContactAt?.toISOString() ?? null,
                    reportedCapabilities: server.reportedCapabilities
                      ? (JSON.parse(server.reportedCapabilities) as string[])
                      : [],
                  }
                : null
            }
          />
          <DemoModeSection
            enabled={appSettings.demoModeEnabled || !server?.setupCompletedAt}
            forcedByMissingSetup={!server?.setupCompletedAt}
          />
          <ServerHealthSection snapshot={latestHealth} />
          <MembersSection
            currentUserId={user.id}
            members={members.map((m) => ({
              id: m.id,
              displayName: m.displayName,
              email: m.email,
              role: m.role as Role,
              mcUsername: m.minecraftAccount?.username ?? null,
              mcUuid: m.minecraftAccount?.uuid ?? null,
            }))}
          />
        </>
      )}
    </div>
  );
}
