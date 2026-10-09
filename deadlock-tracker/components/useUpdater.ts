"use client";
import { useEffect, useState } from "react";
import type { UpdaterState } from "@/lib/desktop";

/** Zustand des Desktop-Updaters; im Browser (ohne Desktop-Hülle) immer null. */
export function useUpdater(): UpdaterState | null {
  const [s, setS] = useState<UpdaterState | null>(null);
  useEffect(() => {
    const d = window.desktop;
    if (!d) return;
    d.getInfo().then(setS).catch(() => {});
    return d.onUpdateState(setS);
  }, []);
  return s;
}
