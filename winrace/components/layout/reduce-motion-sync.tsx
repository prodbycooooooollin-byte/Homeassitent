"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

/**
 * Wendet die persönliche Profil-Einstellung "Animationen reduzieren" an
 * (zusätzlich zur `prefers-reduced-motion`-Media-Query in globals.css).
 * Bewusst client-seitig per Fetch statt im Root-Layout gelesen, damit nicht
 * jede Seite dieser App-weit geteilten Layout-Gruppe einen DB-Round-Trip
 * für eine rein kosmetische Einstellung bekommt.
 */
export function ReduceMotionSync() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.reduceMotion) {
          document.documentElement.classList.add("reduce-motion");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status]);

  return null;
}
