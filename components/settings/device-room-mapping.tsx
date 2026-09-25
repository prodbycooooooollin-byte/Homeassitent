"use client";

import { Icon } from "@/components/ui/icon";
import { useApp } from "@/lib/state/app-context";
import type { Device, Room } from "@/lib/types";

export function DeviceRoomMapping({ devices, rooms }: { devices: Device[]; rooms: Room[] }) {
  const { setDeviceRoom } = useApp();

  return (
    <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
      {devices.map((device) => (
        <li key={device.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-ink-muted">
            <Icon name={device.icon} size={14} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{device.name}</span>
          <select
            value={device.roomId}
            onChange={(e) => void setDeviceRoom(device.id, e.target.value)}
            aria-label={`Raum für ${device.name}`}
            className="h-9 rounded-lg border border-line bg-surface-raised px-2.5 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </li>
      ))}
    </ul>
  );
}
