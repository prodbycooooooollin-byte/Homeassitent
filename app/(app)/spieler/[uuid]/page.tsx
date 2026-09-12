import { notFound } from "next/navigation";
import { Trophy, Skull, Award, Footprints } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { resolveDemoMode } from "@/lib/server-context";
import { getPlayerProfile } from "@/lib/queries/players";
import { getDemoPlayerProfile } from "@/lib/demo/players";
import { DemoModeBanner } from "@/components/ui/demo-badge";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { LiveDot, Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatBreakdownList } from "@/components/players/stat-breakdown-list";
import {
  formatRelativeTime,
  formatDate,
  formatTicksDuration,
  formatNumber,
  formatCentimeters,
  formatCoords,
  formatDateTime,
} from "@/lib/format";
import { DISTANCE_STAT_LABELS, DIMENSION_LABELS, type Dimension } from "@/lib/constants";

export default async function PlayerProfilePage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const user = await requireUser();
  const { demoMode } = await resolveDemoMode();

  const profile = demoMode ? getDemoPlayerProfile(uuid) : await getPlayerProfile(uuid, user.id);
  if (!profile) notFound();

  return (
    <div className="space-y-5">
      {demoMode && <DemoModeBanner />}

      <div className="flex items-center gap-4">
        <PlayerAvatar uuid={profile.uuid} username={profile.username} size={64} />
        <div>
          <h1 className="text-xl font-semibold text-ink">{profile.username}</h1>
          <p className="flex items-center gap-1.5 text-sm text-ink-muted">
            <LiveDot online={profile.isOnline} />
            {profile.isOnline
              ? "Online"
              : profile.lastSeenAt
                ? `Zuletzt online ${formatRelativeTime(profile.lastSeenAt)}`
                : "Noch nie online gesehen"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Erster Beitritt"
          value={profile.firstSeenAt ? formatDate(profile.firstSeenAt) : "-"}
          unavailable={!profile.firstSeenAt}
        />
        <StatCard
          label="Gesamtspielzeit"
          value={profile.totals ? formatTicksDuration(profile.totals.playtimeTicks) : "-"}
          unavailable={!profile.totals}
          sub={profile.ranks.playtimeTicks ? `Rang #${profile.ranks.playtimeTicks}` : undefined}
        />
        <StatCard
          label="Blöcke abgebaut"
          value={profile.totals ? formatNumber(profile.totals.blocksMinedTotal) : "-"}
          unavailable={!profile.totals}
          sub={profile.ranks.blocksMinedTotal ? `Rang #${profile.ranks.blocksMinedTotal}` : undefined}
        />
        <StatCard
          label="Mobs getötet"
          value={profile.totals ? formatNumber(profile.totals.mobKillsTotal) : "-"}
          unavailable={!profile.totals}
          sub={profile.ranks.mobKillsTotal ? `Rang #${profile.ranks.mobKillsTotal}` : undefined}
        />
      </div>

      {profile.latestDeath && (
        <Card className="border-danger/25">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Skull size={15} className="text-danger" /> Letzter Tod (nur für dich sichtbar)
            </CardTitle>
          </CardHeader>
          <CardBody className="text-sm text-ink-muted">
            <p>{formatDateTime(profile.latestDeath.occurredAt)}</p>
            {profile.latestDeath.message && <p className="mt-1 text-ink">{profile.latestDeath.message}</p>}
            {profile.latestDeath.x !== null && profile.latestDeath.z !== null && (
              <p className="mt-1 font-mono text-xs">
                {profile.latestDeath.dimension && DIMENSION_LABELS[profile.latestDeath.dimension as Dimension]}{" "}
                {formatCoords(profile.latestDeath.x, profile.latestDeath.y, profile.latestDeath.z)}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <StatBreakdownList
          title="Abgebaute Blöcke nach Art"
          items={profile.blockStats.map((b) => ({ key: b.blockKey, value: b.count }))}
          emptyHint="Nicht verfügbar - benötigt den Connector-Agent."
        />
        <StatBreakdownList
          title="Getötete Mobs nach Art"
          items={profile.mobStats.map((m) => ({ key: m.mobKey, value: m.kills }))}
          emptyHint="Nicht verfügbar - benötigt den Connector-Agent."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Footprints size={15} /> Zurückgelegte Strecken
          </CardTitle>
        </CardHeader>
        <CardBody>
          {profile.distanceStats.length === 0 ? (
            <p className="text-sm text-ink-muted">Nicht verfügbar - benötigt den Connector-Agent.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {profile.distanceStats.map((d) => (
                <div key={d.type}>
                  <p className="text-xs text-ink-muted">{DISTANCE_STAT_LABELS[d.type] ?? d.type}</p>
                  <p className="text-sm font-medium text-ink">{formatCentimeters(d.cm)}</p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award size={15} /> Fortschritte
          </CardTitle>
        </CardHeader>
        <CardBody>
          {profile.advancements.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Nicht verfügbar - benötigt den Connector-Agent mit Fortschritts-Tracking.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.advancements.map((a) => (
                <Badge key={a.advancementKey} tone="gold" title={formatDateTime(a.unlockedAt)}>
                  <Trophy size={11} /> {a.advancementKey.split("/").pop()?.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
