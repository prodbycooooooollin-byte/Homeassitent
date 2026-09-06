"use client";

import { useEffect, useState } from "react";
import { Trophy, Zap, Clock, Flame, Users2, TrendingUp, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useSocketEvent } from "@/lib/hooks/use-room-realtime";
import { formatDuration, formatRelativeTime } from "@/lib/time";
import type { RoomStatsView, TeamStatsView } from "@/lib/types";

function StatRow({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-ink-faint">
        <Icon className="h-4 w-4" /> {label}
      </span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

function TeamStatsCard({ stats }: { stats: TeamStatsView }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ color: stats.color }}>{stats.name}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-base-border">
        <StatRow icon={BarChart3} label="Gesamtfortschritt" value={`${stats.overallPercent}%`} />
        <StatRow icon={Trophy} label="Abgeschlossene Spiele" value={`${stats.completedGames}/${stats.totalApplicableGames}`} />
        <StatRow icon={Zap} label="Siege insgesamt" value={stats.totalWins} />
        <StatRow icon={Zap} label="Verbleibende Siege" value={stats.remainingWins} />
        <StatRow icon={Flame} label="Aktuelle Serie" value={`${stats.currentStreak} in Folge`} />
        <StatRow icon={Clock} label="Ø Zeit pro Spiel" value={stats.averageTimePerGameMs ? formatDuration(stats.averageTimePerGameMs) : "Noch nicht genug Daten"} />
        <StatRow
          icon={Zap}
          label="Schnellstes Spiel"
          value={stats.fastestGame ? `${stats.fastestGame.name} (${formatDuration(stats.fastestGame.durationMs)})` : "Noch keins"}
        />
        <StatRow icon={Clock} label="Letzter Sieg" value={stats.lastWinAt ? formatRelativeTime(new Date(stats.lastWinAt)) : "Noch keiner"} />
        <StatRow icon={Users2} label="Aktivstes Mitglied" value={stats.mostActiveMember ? `${stats.mostActiveMember.displayName} (${stats.mostActiveMember.actionCount}×)` : "–"} />
        {stats.etaMs !== null && <StatRow icon={TrendingUp} label="Prognose Restzeit" value={formatDuration(stats.etaMs)} />}
      </CardContent>
    </Card>
  );
}

export function StatsView({ code }: { code: string }) {
  const [stats, setStats] = useState<RoomStatsView | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch(`/api/rooms/${code}/stats`);
    if (res.ok) setStats((await res.json()).stats);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  useSocketEvent("progress:updated", load);
  useSocketEvent("challenge:updated", load);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!stats || stats.teams.length === 0) {
    return <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Noch keine Statistiken" description="Sobald die Challenge läuft, erscheinen hier Live-Zahlen." />;
  }

  const leadingTeam = stats.teams.find((t) => t.teamId === stats.leadingTeamId);

  return (
    <div className="space-y-6">
      {leadingTeam && stats.leadMarginPercent !== null && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-4 text-sm">
            <Trophy className="h-4 w-4" style={{ color: leadingTeam.color }} />
            <span>
              <strong style={{ color: leadingTeam.color }}>{leadingTeam.name}</strong> führt mit {stats.leadMarginPercent} Prozentpunkten Abstand.
            </span>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {stats.teams.map((t) => (
          <TeamStatsCard key={t.teamId} stats={t} />
        ))}
      </div>
    </div>
  );
}
