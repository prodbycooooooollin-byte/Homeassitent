"use client";

import { useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Speichert `value` automatisch (debounced) über `save`, sobald es sich vom
 * zuletzt gespeicherten Stand unterscheidet. Für "Automatisches Speichern
 * von Einstellungen mit sichtbarem Status" (statt eines Speichern-Buttons).
 */
export function useAutosave<T>(value: T, save: (value: T) => Promise<void>, delayMs = 900) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const lastSaved = useRef<string>(JSON.stringify(value));
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const serialized = JSON.stringify(value);
    if (serialized === lastSaved.current) return;

    setStatus("saving");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      try {
        await save(value);
        lastSaved.current = serialized;
        setStatus("saved");
        setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
      } catch {
        setStatus("error");
      }
    }, delayMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return status;
}
