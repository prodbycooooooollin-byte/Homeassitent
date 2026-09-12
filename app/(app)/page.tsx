import { ServerOff } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getPrimaryServer, resolveDemoMode } from "@/lib/server-context";
import { getOverviewData } from "@/lib/queries/overview";
import { getDemoOverviewData } from "@/lib/demo/overview";
import { DemoModeBanner } from "@/components/ui/demo-badge";
import { StaleDataNote } from "@/components/ui/demo-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { ServerHeader } from "@/components/dashboard/server-header";
import { OnlinePlayersCard } from "@/components/dashboard/online-players-card";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { ChronicleSection } from "@/components/dashboard/chronicle-section";
import { WeeklyRecapCard } from "@/components/dashboard/weekly-recap-card";
import { getRecentEvents } from "@/lib/queries/chronicle";
import { getWeeklyRecap } from "@/lib/queries/weekly-recap";
import { getDemoChronicle, getDemoWeeklyRecap } from "@/lib/demo/chronicle";
import { canCreateContent } from "@/lib/auth/permissions";
import { formatAge, formatNumber, formatSecondsDuration, formatTicksDuration, formatRelativeTime } from "@/lib/format";

export default async function OverviewPage() {
  const user = await requireUser();
  const { demoMode } = await resolveDemoMode();
  const server = await getPrimaryServer();

  if (!server && !demoMode) {
    return <NotConfigured isAdmin={user.role === "ADMIN"} />;
  }

  const data = demoMode || !server ? getDemoOverviewData() : await getOverviewData(server);
  const [events, recap] =
    demoMode || !server
      ? [getDemoChronicle(), getDemoWeeklyRecap()]
      : await Promise.all([getRecentEvents(server.id), getWeeklyRecap(server.id)]);

  const uptimeSeconds = data.server.lastStartedAt
    ? Math.floor((Date.now() - data.server.lastStartedAt.getTime()) / 1000)
    : null;

  return (
    <div className="space-y-5">
      {demoMode && <DemoModeBanner />}
      {!demoMode && data.status.stale && data.status.asOf && <StaleDataNote asOf={data.status.asOf} />}
      {!demoMode && data.status.stale && !data.status.asOf && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          Noch keine erfolgreiche Verbindung zum Server hergestellt.
        </div>
      )}

      <ServerHeader
        name={data.server.name}
        host={data.server.host}
        port={data.server.port}
        online={data.status.online}
        motd={data.status.motd}
        asOf={data.status.asOf}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Serveralter"
          value={data.server.foundedAt ? formatAge(data.server.foundedAt) : "-"}
          unavailable={!data.server.foundedAt}
          sub={data.server.foundedAt ? "seit Gründung" : "vom Admin noch nicht hinterlegt"}
        />
        <StatCard
          label="Laufzeit seit Start"
          value={uptimeSeconds !== null ? formatSecondsDuration(uptimeSeconds) : "-"}
          unavailable={uptimeSeconds === null}
          sub={data.connectionLevel === "full" ? undefined : "braucht Connector-Agent"}
        />
        <StatCard
          label="Gesamtspielzeit"
          value={formatTicksDuration(data.totals.playtimeTicks)}
          unavailable={data.totals.trackedPlayers === 0}
          sub={`${data.totals.trackedPlayers} erfasste Spieler`}
        />
        <StatCard
          label="Version"
          value={data.server.minecraftVersion}
          sub={data.modpack ? `Modpack ${data.modpack.name} v${data.modpack.versionNumber}` : "Kein Modpack hinterlegt"}
        />
        <StatCard
          label="Blöcke abgebaut"
          value={formatNumber(data.totals.blocksMined)}
          unavailable={data.totals.trackedPlayers === 0}
        />
        <StatCard
          label="Mobs getötet"
          value={formatNumber(data.totals.mobKills)}
          unavailable={data.totals.trackedPlayers === 0}
        />
        <StatCard
          label="Tode"
          value={formatNumber(data.totals.deaths)}
          unavailable={data.totals.trackedPlayers === 0}
        />
        <StatCard
          label="Datenerfassung seit"
          value={data.totals.dataSince ? formatRelativeTime(data.totals.dataSince) : "-"}
          unavailable={!data.totals.dataSince}
        />
      </div>

      <OnlinePlayersCard online={data.players.online} max={data.players.max} list={data.players.onlineList} />

      <ActivityChart days={data.activityDays} />

      <WeeklyRecapCard recap={recap} />
      <ChronicleSection events={events} canAdd={!demoMode && canCreateContent(user.role)} />
    </div>
  );
}

function NotConfigured({ isAdmin }: { isAdmin: boolean }) {
  return (
    <EmptyState
      icon={ServerOff}
      title="Noch kein Minecraft-Server verbunden"
      description={
        isAdmin
          ? "Richte die Serververbindung in den Einstellungen ein, um echte Daten zu sehen. Bis dahin kannst du den Demo-Modus aktivieren, um die Oberfläche mit Beispieldaten zu testen."
          : "Ein Admin muss zuerst die Serververbindung in den Einstellungen einrichten."
      }
      action={isAdmin ? <LinkButton href="/einstellungen">Zu den Einstellungen</LinkButton> : undefined}
    />
  );
}
