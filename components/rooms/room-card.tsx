"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { formatTemperature, formatWatt } from "@/lib/format";
import type { Device, Room } from "@/lib/types";

export function RoomCard({ room, devices }: { room: Room; devices: Device[] }) {
  const activeCount = devices.filter((d) => d.isOn).length;
  const lightsOn = devices.some((d) => d.type === "light" && d.isOn);
  const totalPower = devices.reduce((sum, d) => sum + d.currentPowerW, 0);

  return (
    <Link
      href={`/raeume/${room.id}`}
      className="flex flex-col gap-3 rounded-xl2 border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong sm:p-5"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-raised text-ink-muted">
            <Icon name={room.icon} size={18} />
          </span>
          <span className="text-sm font-semibold text-ink">{room.name}</span>
        </span>
        <Icon name="chevron-right" size={16} className="text-ink-faint" />
      </div>

      <div className="flex items-end justify-between">
        <p className="text-2xl font-semibold text-ink">{formatTemperature(room.temperature)}</p>
        <p className="text-xs text-ink-muted">{formatWatt(totalPower)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={room.heatingStatus === "heating" ? "warn" : "neutral"}>
          <Icon name="flame" size={11} />
          {room.heatingStatus === "heating" ? "Heizt" : room.heatingStatus === "off" ? "Aus" : "Bereit"}
        </Badge>
        <Badge tone={lightsOn ? "good" : "neutral"}>
          <Icon name="lightbulb" size={11} />
          {lightsOn ? "Licht an" : "Licht aus"}
        </Badge>
        <Badge tone="neutral">
          <Icon name="plug-zap" size={11} />
          {activeCount} aktiv
        </Badge>
      </div>

      {room.warnings && room.warnings.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-warn">
          <Icon name="alert-triangle" size={12} />
          {room.warnings[0]}
        </p>
      )}
    </Link>
  );
}
