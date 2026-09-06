"use client";

import { useRoomState } from "@/lib/client/room-state-context";
import { StatsView } from "@/components/rooms/stats-view";

export default function DashboardStatsPage() {
  const { code } = useRoomState();
  return <StatsView code={code} />;
}
