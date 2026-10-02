"use client";

import { Icon } from "@/components/ui/icon";
import { DEVICE_TYPE_OPTIONS, type DeviceStatusFilter } from "@/lib/device-meta";
import type { DeviceType, Room } from "@/lib/types";

export type SortKey = "power-desc" | "power-asc" | "name-asc";

const STATUS_OPTIONS: { value: DeviceStatusFilter; label: string }[] = [
  { value: "all", label: "Alle Zustände" },
  { value: "active", label: "Aktiv" },
  { value: "standby", label: "Inaktiv" },
  { value: "offline", label: "Offline" },
  { value: "high", label: "Hoher Verbrauch" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "power-desc", label: "Verbrauch: absteigend" },
  { value: "power-asc", label: "Verbrauch: aufsteigend" },
  { value: "name-asc", label: "Name: A–Z" },
];

interface DeviceFiltersState {
  search: string;
  roomId: string;
  type: DeviceType | "all";
  status: DeviceStatusFilter;
  sort: SortKey;
}

export function DeviceFilters({
  value,
  onChange,
  rooms,
}: {
  value: DeviceFiltersState;
  onChange: (next: DeviceFiltersState) => void;
  rooms: Room[];
}) {
  const selectClasses =
    "h-11 rounded-xl border border-line bg-surface-raised px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent";

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder="Gerät suchen…"
          aria-label="Geräte durchsuchen"
          className="h-11 w-full rounded-xl border border-line bg-surface-raised pl-10 pr-3 text-sm text-ink outline-none placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-accent"
        />
      </div>

      <div className="flex flex-wrap gap-2 overflow-x-auto">
        <select
          value={value.roomId}
          onChange={(e) => onChange({ ...value, roomId: e.target.value })}
          aria-label="Nach Raum filtern"
          className={selectClasses}
        >
          <option value="all">Alle Räume</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <select
          value={value.type}
          onChange={(e) => onChange({ ...value, type: e.target.value as DeviceType | "all" })}
          aria-label="Nach Gerätetyp filtern"
          className={selectClasses}
        >
          {DEVICE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as DeviceStatusFilter })}
          aria-label="Nach Status filtern"
          className={selectClasses}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={value.sort}
          onChange={(e) => onChange({ ...value, sort: e.target.value as SortKey })}
          aria-label="Sortierung"
          className={selectClasses}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
