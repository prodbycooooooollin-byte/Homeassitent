"use client";
import { useEffect, useState } from "react";
import type { IngestState } from "@/lib/desktop";

/** Status des im Hintergrund laufenden Ingest-Tools (nur in der Desktop-App). */
export function useIngest(): IngestState | null {
  const [s, setS] = useState<IngestState | null>(null);
  useEffect(() => {
    const d = window.desktop;
    if (!d?.getIngest) return;
    d.getIngest().then(setS).catch(() => {});
    return d.onIngestState?.(setS);
  }, []);
  return s;
}

export const INGEST_COLOR: Record<IngestState["state"], string> = { off: "#5b6478", downloading: "#f0b44c", running: "#3ecf8e", external: "#4aa3ff", error: "#f0616d", unsupported: "#5b6478" };
