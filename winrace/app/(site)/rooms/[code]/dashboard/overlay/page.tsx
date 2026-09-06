"use client";

import { ShieldAlert } from "lucide-react";
import { OverlayConfigurator } from "@/components/rooms/overlay-configurator";
import { EmptyState } from "@/components/ui/empty-state";
import { useRoomState } from "@/lib/client/room-state-context";

export default function OverlayPage() {
  const { state } = useRoomState();
  if (!state.viewer.permissions.canManageOverlay) {
    return <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="Kein Zugriff" description="Nur der Host kann Overlays konfigurieren." />;
  }
  return <OverlayConfigurator />;
}
