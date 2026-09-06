"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { RoomClimateCard } from "@/components/climate/room-climate-card";
import { RoomDetailModal } from "@/components/climate/room-detail-modal";
import { WaterHeaterCard } from "@/components/climate/water-heater-card";
import { useApp } from "@/lib/state/app-context";
import type { Room } from "@/lib/types";

export default function KlimaPage() {
  const { snapshot, loading } = useApp();
  const [openRoom, setOpenRoom] = useState<Room | null>(null);

  if (loading || !snapshot) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Klima & Heizung" description="Raumtemperaturen, Heizmodi und Warmwasser im Überblick." />

      <WaterHeaterCard heater={snapshot.waterHeater} />

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">Räume</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.rooms.map((room) => (
            <RoomClimateCard key={room.id} room={room} onOpenDetail={setOpenRoom} />
          ))}
        </div>
      </div>

      <RoomDetailModal room={openRoom} onClose={() => setOpenRoom(null)} />
    </div>
  );
}
