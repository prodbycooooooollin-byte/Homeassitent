import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateTime } from "@/lib/format";

export interface HealthSnapshot {
  capturedAt: Date;
  tps: number | null;
  tickTimeMs: number | null;
  memoryUsedMb: number | null;
  memoryMaxMb: number | null;
}

export function ServerHealthSection({ snapshot }: { snapshot: HealthSnapshot | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Serverzustand</CardTitle>
      </CardHeader>
      <CardBody>
        {!snapshot ? (
          <p className="text-sm text-ink-muted">
            Nicht verfügbar - der Connector-Agent liefert aktuell keine TPS-/Tickzeit-/
            Speicherwerte. Diese Metriken erfordern eine zusätzliche serverseitige
            Anbindung (z. B. ein Performance-Mod, der sie dem Agent bereitstellt).
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="TPS" value={snapshot.tps?.toFixed(1) ?? "-"} unavailable={snapshot.tps == null} />
            <StatCard
              label="Tickzeit"
              value={snapshot.tickTimeMs ? `${snapshot.tickTimeMs.toFixed(1)} ms` : "-"}
              unavailable={snapshot.tickTimeMs == null}
            />
            <StatCard
              label="Speicher"
              value={
                snapshot.memoryUsedMb && snapshot.memoryMaxMb
                  ? `${snapshot.memoryUsedMb}/${snapshot.memoryMaxMb} MB`
                  : "-"
              }
              unavailable={snapshot.memoryUsedMb == null}
            />
            <StatCard label="Stand" value={formatDateTime(snapshot.capturedAt)} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
