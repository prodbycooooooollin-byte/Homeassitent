import { Icon } from "@/components/ui/icon";
import { formatKwh } from "@/lib/format";
import type { Device, Room } from "@/lib/types";

export function TopConsumersBars({ devices, rooms }: { devices: Device[]; rooms: Room[] }) {
  const sorted = [...devices].sort((a, b) => b.todayEnergyKwh - a.todayEnergyKwh).slice(0, 6);
  const max = Math.max(...sorted.map((d) => d.todayEnergyKwh), 0.1);
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id;

  return (
    <ul className="space-y-3">
      {sorted.map((device) => (
        <li key={device.id}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-ink">
              <Icon name={device.icon} size={13} className="text-ink-faint" />
              {device.name}
              <span className="text-ink-faint">· {roomName(device.roomId)}</span>
            </span>
            <span className="font-medium text-ink tabular-nums">{formatKwh(device.todayEnergyKwh)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent-strong transition-[width] duration-500"
              style={{ width: `${Math.max(4, (device.todayEnergyKwh / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
