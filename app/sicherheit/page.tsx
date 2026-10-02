"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { AlarmPanel } from "@/components/security/alarm-panel";
import { SecurityEntityRow } from "@/components/security/security-entity-row";
import { formatRelativeTime } from "@/lib/format";
import { useApp } from "@/lib/state/app-context";
import type { SecurityEntity } from "@/lib/types";

const GROUPS: { kind: SecurityEntity["kind"]; title: string; icon: string }[] = [
  { kind: "contact", title: "Tür- & Fensterkontakte", icon: "door-closed" },
  { kind: "motion", title: "Bewegungsmelder", icon: "activity" },
  { kind: "smoke", title: "Rauchmelder", icon: "siren" },
  { kind: "water", title: "Wassersensoren", icon: "droplet" },
  { kind: "camera", title: "Kameras", icon: "camera" },
];

export default function SicherheitPage() {
  const { snapshot, loading } = useApp();

  if (loading || !snapshot) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Sicherheit" description="Sensoren, Kameras und Alarmstatus im Überblick." />

      <AlarmPanel mode={snapshot.alarmMode} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {GROUPS.map((group) => {
          const entities = snapshot.securityEntities.filter((e) => e.kind === group.kind);
          if (entities.length === 0) return null;
          return (
            <Card key={group.kind}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon name={group.icon} size={15} className="text-ink-muted" />
                  {group.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {entities.map((entity) => (
                  <SecurityEntityRow key={entity.id} entity={entity} />
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Letzte Ereignisse</CardTitle>
        </CardHeader>
        <CardContent>
          {snapshot.securityEvents.length === 0 ? (
            <EmptyState icon="shield-check" title="Keine Ereignisse" />
          ) : (
            <ul className="space-y-2.5">
              {snapshot.securityEvents.map((event) => (
                <li key={event.id} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface p-3 text-sm">
                  <span className="flex items-start gap-2 text-ink">
                    <Icon
                      name={event.severity === "critical" ? "alert-triangle" : event.severity === "warning" ? "alert-triangle" : "shield-check"}
                      size={15}
                      className={event.severity === "critical" ? "mt-0.5 text-bad" : event.severity === "warning" ? "mt-0.5 text-warn" : "mt-0.5 text-accent-strong"}
                    />
                    {event.message}
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">{formatRelativeTime(event.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
