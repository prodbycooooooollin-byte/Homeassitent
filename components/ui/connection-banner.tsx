"use client";

import { useApp } from "@/lib/state/app-context";
import { Icon } from "./icon";

export function ConnectionBanner() {
  const { connectionStatus, settings } = useApp();

  if (connectionStatus === "connected" || connectionStatus === "demo") return null;

  return (
    <div className="flex items-center gap-2 border-b border-bad/30 bg-bad-soft px-4 py-2 text-xs font-medium text-bad sm:px-6">
      <Icon name="wifi-off" size={14} />
      {connectionStatus === "connecting"
        ? "Verbindung zu Home Assistant wird hergestellt…"
        : `Home Assistant nicht erreichbar${settings.haUrl ? ` (${settings.haUrl})` : ""}. Zuletzt bekannter Zustand wird angezeigt.`}
    </div>
  );
}
