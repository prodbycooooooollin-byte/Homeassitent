"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { DeviceFilters, type SortKey } from "@/components/devices/device-filters";
import { DeviceCard } from "@/components/devices/device-card";
import { DeviceDetailPanel } from "@/components/devices/device-detail-panel";
import { HIGH_CONSUMPTION_THRESHOLD_W, type DeviceStatusFilter } from "@/lib/device-meta";
import { useApp } from "@/lib/state/app-context";
import type { Device, DeviceType } from "@/lib/types";

export default function GeraetePage() {
  const { snapshot, loading } = useApp();
  const [filters, setFilters] = useState({
    search: "",
    roomId: "all",
    type: "all" as DeviceType | "all",
    status: "all" as DeviceStatusFilter,
    sort: "power-desc" as SortKey,
  });
  const [selected, setSelected] = useState<Device | null>(null);

  const filtered = useMemo(() => {
    if (!snapshot) return [];
    let list = [...snapshot.devices];

    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter((d) => d.name.toLowerCase().includes(q));
    }
    if (filters.roomId !== "all") list = list.filter((d) => d.roomId === filters.roomId);
    if (filters.type !== "all") list = list.filter((d) => d.type === filters.type);
    if (filters.status !== "all") {
      list = list.filter((d) => {
        if (filters.status === "high") return d.currentPowerW >= HIGH_CONSUMPTION_THRESHOLD_W;
        return d.status === filters.status;
      });
    }

    list.sort((a, b) => {
      if (filters.sort === "name-asc") return a.name.localeCompare(b.name, "de");
      if (filters.sort === "power-asc") return a.currentPowerW - b.currentPowerW;
      return b.currentPowerW - a.currentPowerW;
    });

    return list;
  }, [snapshot, filters]);

  if (loading || !snapshot) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const roomFor = (roomId: string) => snapshot.rooms.find((r) => r.id === roomId);

  return (
    <div className="space-y-5">
      <PageHeader title="Geräte" description={`${filtered.length} von ${snapshot.devices.length} Geräten`} />

      <DeviceFilters value={filters} onChange={setFilters} rooms={snapshot.rooms} />

      {filtered.length === 0 ? (
        <EmptyState icon="search" title="Keine Geräte gefunden" description="Passe deine Filter oder die Suche an." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((device) => (
            <DeviceCard key={device.id} device={device} room={roomFor(device.roomId)} onOpen={setSelected} />
          ))}
        </div>
      )}

      <DeviceDetailPanel
        device={selected}
        room={selected ? roomFor(selected.roomId) : undefined}
        automations={snapshot.automations}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
