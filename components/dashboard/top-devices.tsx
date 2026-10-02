"use client";

import { Icon } from "@/components/ui/icon";
import { Toggle } from "@/components/ui/toggle";
import { DeviceStatusBadge } from "@/components/devices/device-status-badge";
import { formatKwh, formatWatt } from "@/lib/format";
import { useApp } from "@/lib/state/app-context";
import type { Device, Room } from "@/lib/types";

export function TopDevices({ devices, rooms }: { devices: Device[]; rooms: Room[] }) {
  const { toggleDevice } = useApp();
  const top = [...devices].sort((a, b) => b.currentPowerW - a.currentPowerW).slice(0, 5);
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id;

  return (
    <ul className="divide-y divide-line">
      {top.map((device) => (
        <li key={device.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-ink-muted">
            <Icon name={device.icon} size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{device.name}</p>
            <p className="truncate text-xs text-ink-faint">{roomName(device.roomId)}</p>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-ink tabular-nums">{formatWatt(device.currentPowerW)}</p>
            <p className="text-[0.7rem] text-ink-faint tabular-nums">heute {formatKwh(device.todayEnergyKwh)}</p>
          </div>
          <DeviceStatusBadge status={device.status} />
          {device.controllable ? (
            <Toggle
              checked={device.isOn}
              onChange={() => void toggleDevice(device.id)}
              label={`${device.name} schalten`}
              size="sm"
            />
          ) : (
            <div className="w-[3.25rem]" />
          )}
        </li>
      ))}
    </ul>
  );
}
