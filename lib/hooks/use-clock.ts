"use client";

import { useEffect, useState } from "react";

/**
 * Liefert die aktuelle Uhrzeit, aktualisiert im angegebenen Intervall.
 * Gibt bis zum ersten Client-Render `null` zurück, damit Server- und
 * Client-Markup beim Hydrieren übereinstimmen (kein Zeitstempel vom Server).
 */
export function useClock(intervalMs = 15000): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
