"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { DeviceCard } from "@/components/devices/device-card";
import { DeviceDetailPanel } from "@/components/devices/device-detail-panel";
import { formatTemperature } from "@/lib/format";
import { useApp } from "@/lib/state/app-context";
import type { ClimateMode, Device } from "@/lib/types";

const MODE_OPTIONS: { value: ClimateMode; label: string }[] = [
  { value: "off", label: "Aus" },
  { value: "auto", label: "Auto" },
  { value: "heat", label: "Heizen" },
  { value: "eco", label: "Eco" },
];

export default function RoomDetailPage() {
  const params = useParams<{ roomId: string }>();
  const { snapshot, loading, setRoomTarget, setRoomMode } = useApp();
  const [selected, setSelected] = useState<Device | null>(null);

  if (loading || !snapshot) {
    return <SkeletonCard />;
  }

  const room = snapshot.rooms.find((r) => r.id === params.roomId);
  if (!room) {
    return (
      <EmptyState icon="layout-grid" title="Raum nicht gefunden" description="Dieser Raum existiert nicht (mehr)." />
    );
  }

  const devices = snapshot.devices.filter((d) => d.roomId === room.id);
  const securityEntities = snapshot.securityEntities.filter((s) => s.roomId === room.id);

  function adjust(delta: number) {
    const next = Math.min(28, Math.max(10, Math.round((room!.targetTemperature + delta) * 2) / 2));
    void setRoomTarget(room!.id, next);
  }

  return (
    <div className="space-y-6">
      <Link href="/raeume" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <Icon name="chevron-left" size={16} />
        Alle Räume
      </Link>

      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-raised text-ink-muted">
          <Icon name={room.icon} size={22} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink sm:text-2xl">{room.name}</h1>
          <p className="text-sm text-ink-muted">{devices.length} Geräte in diesem Raum</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Klima</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-4xl font-semibold leading-none text-ink">{formatTemperature(room.temperature)}</p>
              <p className="mt-1.5 text-sm text-ink-muted">
                Ziel {formatTemperature(room.targetTemperature)} · {room.humidity}% Feuchte
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => adjust(-0.5)}
                aria-label="Zieltemperatur senken"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-raised text-ink hover:bg-surface-hover active:scale-95"
              >
                <Icon name="minus" size={16} />
              </button>
              <button
                onClick={() => adjust(0.5)}
                aria-label="Zieltemperatur erhöhen"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-raised text-ink hover:bg-surface-hover active:scale-95"
              >
                <Icon name="plus" size={16} />
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Badge tone={room.heatingStatus === "heating" ? "warn" : "neutral"}>
              <Icon name="flame" size={11} />
              {room.heatingStatus === "heating" ? "Heizt" : room.heatingStatus === "off" ? "Aus" : "Bereit"}
            </Badge>
            {room.windowOpen && (
              <Badge tone="warn">
                <Icon name="alert-triangle" size={11} />
                Fenster offen
              </Badge>
            )}
          </div>

          <Segmented value={room.mode} onChange={(mode) => void setRoomMode(room.id, mode)} options={MODE_OPTIONS} fullWidth />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">Geräte</h2>
        {devices.length === 0 ? (
          <EmptyState icon="plug-zap" title="Keine Geräte" description="Diesem Raum sind keine Geräte zugeordnet." />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {devices.map((device) => (
              <DeviceCard key={device.id} device={device} room={room} onOpen={setSelected} />
            ))}
          </div>
        )}
      </div>

      {securityEntities.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">Sicherheit</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {securityEntities.map((entity) => (
              <div key={entity.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                <span className="text-sm text-ink">{entity.name}</span>
                <Badge tone={entity.state === "clear" || entity.state === "online" ? "good" : "warn"}>{entity.state}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <DeviceDetailPanel device={selected} room={room} automations={snapshot.automations} onClose={() => setSelected(null)} />
    </div>
  );
}
