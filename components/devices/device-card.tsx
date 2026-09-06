"use client";

import { Icon } from "@/components/ui/icon";
import { Toggle } from "@/components/ui/toggle";
import { DeviceStatusBadge } from "./device-status-badge";
import { formatKwh, formatWatt } from "@/lib/format";
import { useApp } from "@/lib/state/app-context";
import { HIGH_CONSUMPTION_THRESHOLD_W } from "@/lib/device-meta";
import type { Device, Room } from "@/lib/types";
import { cn } from "@/lib/cn";

export function DeviceCard({ device, room, onOpen }: { device: Device; room?: Room; onOpen: (device: Device) => void }) {
  const { toggleDevice } = useApp();
  const highConsumption = device.currentPowerW >= HIGH_CONSUMPTION_THRESHOLD_W;

  return (
    <div className="flex items-center gap-3 rounded-xl2 border border-line bg-surface p-4 shadow-card">
      <button onClick={() => onOpen(device)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            device.status === "error" ? "bg-bad-soft text-bad" : "bg-surface-raised text-ink-muted",
          )}
        >
          <Icon name={device.icon} size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-ink">{device.name}</span>
            {highConsumption && <Icon name="alert-triangle" size={13} className="shrink-0 text-warn" />}
          </span>
          <span className="block truncate text-xs text-ink-faint">{room?.name ?? device.roomId}</span>
          <span className="mt-0.5 flex items-center gap-2 text-xs">
            <span className="font-medium text-ink tabular-nums">{formatWatt(device.currentPowerW)}</span>
            <span className="text-ink-faint tabular-nums">heute {formatKwh(device.todayEnergyKwh)}</span>
          </span>
        </span>
      </button>

      <DeviceStatusBadge status={device.status} />

      {device.controllable ? (
        <Toggle checked={device.isOn} onChange={() => void toggleDevice(device.id)} label={`${device.name} schalten`} size="sm" />
      ) : (
        <div className="w-[3.25rem]" />
      )}
    </div>
  );
}
