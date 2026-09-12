import Link from "next/link";
import { Users } from "lucide-react";
import { resolveDemoMode } from "@/lib/server-context";
import { getPlayersList } from "@/lib/queries/players";
import { getDemoPlayersList } from "@/lib/demo/players";
import { DemoModeBanner } from "@/components/ui/demo-badge";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { LiveDot } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime, formatTicksDuration } from "@/lib/format";

export const metadata = { title: "Spieler" };

export default async function PlayersPage() {
  const { demoMode } = await resolveDemoMode();
  const players = demoMode ? getDemoPlayersList() : await getPlayersList();

  return (
    <div className="space-y-5">
      {demoMode && <DemoModeBanner />}
      <div>
        <h1 className="text-xl font-semibold text-ink">Spieler</h1>
        <p className="text-sm text-ink-muted">{players.length} erfasste Spieler</p>
      </div>

      {players.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Noch keine Spieler erfasst"
          description="Sobald der Connector-Agent läuft und Spieler auf dem Server aktiv sind, erscheinen sie hier."
        />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {players.map((p) => (
            <Link key={p.uuid} href={`/spieler/${p.uuid}`}>
              <Card className="flex items-center gap-3 p-3 transition-colors hover:border-accent/40">
                <PlayerAvatar uuid={p.uuid} username={p.username} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{p.username}</p>
                  <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <LiveDot online={p.isOnline} />
                    {p.isOnline ? "Online" : p.lastSeenAt ? `Zuletzt ${formatRelativeTime(p.lastSeenAt)}` : "Nie online"}
                  </p>
                  {p.playtimeTicks !== null && (
                    <p className="text-xs text-ink-faint">{formatTicksDuration(p.playtimeTicks)} Spielzeit</p>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
