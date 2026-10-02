"use client";

import { PageHeader } from "@/components/ui/page-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { RoomCard } from "@/components/rooms/room-card";
import { useApp } from "@/lib/state/app-context";

export default function RaeumePage() {
  const { snapshot, loading } = useApp();

  if (loading || !snapshot) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Räume" description="Dein Zuhause auf einen Blick, gruppiert nach Räumen." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {snapshot.rooms.map((room) => (
          <RoomCard key={room.id} room={room} devices={snapshot.devices.filter((d) => d.roomId === room.id)} />
        ))}
      </div>
    </div>
  );
}
