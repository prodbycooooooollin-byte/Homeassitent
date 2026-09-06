"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Gamepad2 } from "lucide-react";
import { useRoomState } from "@/lib/client/room-state-context";
import { LifecycleControls } from "@/components/rooms/lifecycle-controls";
import { HostAccessCard } from "@/components/rooms/host-access-card";
import { TeamSummaryCard } from "@/components/rooms/team-summary-card";
import { ActivityFeedList, type ActivityItem } from "@/components/rooms/activity-feed-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { summarizeTeamProgress } from "@/lib/client/derive";

export default function DashboardOverviewPage() {
  const { state, code } = useRoomState();
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const perms = state.viewer.permissions;
  const games = state.challenge?.games ?? [];

  useEffect(() => {
    fetch(`/api/rooms/${code}/activity?limit=6`)
      .then((r) => r.json())
      .then((d) => setRecentActivity(d.events ?? []))
      .catch(() => {});
  }, [code, state.challenge?.status, games.length]);

  const leadingTeamId = (() => {
    if (state.teams.length !== 2) return null;
    const [a, b] = state.teams.map((t) => ({ id: t.id, pct: summarizeTeamProgress(t, games).overallPercent }));
    if (a.pct === b.pct) return null;
    return a.pct > b.pct ? a.id : b.id;
  })();

  return (
    <div className="space-y-6">
      {perms.canManageRoom && (
        <Card>
          <CardHeader>
            <CardTitle>Ablauf steuern</CardTitle>
          </CardHeader>
          <CardContent>
            <LifecycleControls />
          </CardContent>
        </Card>
      )}

      {games.length === 0 ? (
        <EmptyState
          icon={<Gamepad2 className="h-8 w-8" />}
          title="Noch keine Spiele konfiguriert"
          description="Lege fest, welche Spiele beide Teams abschließen müssen, bevor die Challenge gestartet werden kann."
          action={
            perms.canManageRoom ? (
              <Link href={`/rooms/${code}/dashboard/challenge`}>
                <Button>
                  Spiele hinzufügen <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {state.teams.map((team) => (
            <TeamSummaryCard key={team.id} team={team} games={games} leading={team.id === leadingTeamId} />
          ))}
        </div>
      )}

      {perms.canManageRoom && <HostAccessCard />}

      <Card>
        <CardHeader>
          <CardTitle>Letzte Aktivität</CardTitle>
          <Link href={`/rooms/${code}/dashboard/activity`} className="text-xs font-medium text-brand hover:underline">
            Alle ansehen
          </Link>
        </CardHeader>
        <CardContent>
          <ActivityFeedList items={recentActivity} emptyHint="Sobald etwas passiert, erscheint es hier." />
        </CardContent>
      </Card>
    </div>
  );
}
