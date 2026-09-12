"use client";

import dynamic from "next/dynamic";
import type { Role } from "@/lib/constants";

const MapShell = dynamic(() => import("@/components/map/map-shell"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center text-sm text-ink-muted">Karte wird geladen…</div>
  ),
});

export function MapShellLoader(props: { currentUser: { id: string; role: Role }; tileUrlTemplate: string | null }) {
  return <MapShell {...props} />;
}
