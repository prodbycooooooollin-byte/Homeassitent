"use client";

import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { formatTemperature } from "@/lib/format";
import { useApp } from "@/lib/state/app-context";
import type { ClimateMode, Room } from "@/lib/types";
import { cn } from "@/lib/cn";

const MODE_OPTIONS: { value: ClimateMode; label: string }[] = [
  { value: "off", label: "Aus" },
  { value: "auto", label: "Auto" },
  { value: "heat", label: "Heizen" },
  { value: "eco", label: "Eco" },
];

export function RoomClimateCard({ room, onOpenDetail }: { room: Room; onOpenDetail: (room: Room) => void }) {
  const { setRoomTarget, setRoomMode } = useApp();

  function adjust(delta: number) {
    const next = Math.min(28, Math.max(10, Math.round((room.targetTemperature + delta) * 2) / 2));
    void setRoomTarget(room.id, next);
  }

  return (
    <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card sm:p-5">
      <button onClick={() => onOpenDetail(room)} className="mb-3 flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-raised text-ink-muted">
            <Icon name={room.icon} size={17} />
          </span>
          <span className="text-sm font-semibold text-ink">{room.name}</span>
        </span>
        <Icon name="chevron-right" size={16} className="text-ink-faint" />
      </button>

      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-3xl font-semibold leading-none text-ink">{formatTemperature(room.temperature)}</p>
          <p className="mt-1 text-xs text-ink-muted">Ziel {formatTemperature(room.targetTemperature)} · {room.humidity}% Feuchte</p>
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={room.heatingStatus === "heating" ? "warn" : room.heatingStatus === "off" ? "neutral" : "good"}>
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

      {room.warnings && room.warnings.length > 0 && (
        <p className={cn("mt-3 text-[0.7rem] text-warn")}>{room.warnings[0]}</p>
      )}
    </div>
  );
}
