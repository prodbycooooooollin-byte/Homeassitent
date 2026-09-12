import { CalendarDays } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { formatNumber, formatTicksDuration, formatDate } from "@/lib/format";
import type { WeeklyRecap } from "@/lib/queries/weekly-recap";

export function WeeklyRecapCard({ recap }: { recap: WeeklyRecap }) {
  const hasAnything =
    recap.mostActive.length > 0 || recap.blocksMined > 0 || recap.mobKills > 0 || recap.goalsCompleted.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays size={15} /> Wochenrückblick
        </CardTitle>
        <span className="text-xs text-ink-muted">seit {formatDate(recap.since)}</span>
      </CardHeader>
      <CardBody className="space-y-4">
        {!hasAnything ? (
          <p className="text-sm text-ink-muted">Diese Woche noch keine erfasste Aktivität.</p>
        ) : (
          <>
            {recap.mostActive.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-ink-muted">Aktivste Spieler</p>
                <div className="flex flex-wrap gap-2">
                  {recap.mostActive.map((p) => (
                    <div key={p.uuid} className="flex items-center gap-1.5 rounded-full bg-surface-raised px-2 py-1">
                      <PlayerAvatar uuid={p.uuid} username={p.username} size={20} />
                      <span className="text-xs text-ink">{p.username}</span>
                      <span className="text-xs text-ink-faint">{formatTicksDuration(p.playtimeTicks)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Blöcke abgebaut" value={formatNumber(recap.blocksMined)} />
              <Stat label="Mobs getötet" value={formatNumber(recap.mobKills)} />
              <Stat label="Ziele erreicht" value={String(recap.goalsCompleted.length)} />
              <Stat label="Neue Projekte" value={String(recap.newProjects.length)} />
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}
