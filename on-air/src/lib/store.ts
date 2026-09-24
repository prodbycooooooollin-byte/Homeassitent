import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api";
import type { AppSnapshot } from "./types";

let current: AppSnapshot | null = null;
let loadError: string | null = null;
const listeners = new Set<() => void>();
let started = false;

function emit() {
  listeners.forEach((l) => l());
}

export function setSnapshot(s: AppSnapshot) {
  current = s;
  loadError = null;
  emit();
}

export async function refresh() {
  try {
    setSnapshot(await api.snapshot());
  } catch (e) {
    loadError = (e as { message?: string }).message ?? String(e);
    emit();
  }
}

function start() {
  if (started) return;
  started = true;
  void refresh();
  void api.onSnapshot(setSnapshot);
  // Sicherheitsnetz, falls ein Ereignis verloren geht (z. B. nach Standby).
  setInterval(() => void refresh(), 15_000);
}

export function useSnapshot(): { snap: AppSnapshot | null; error: string | null } {
  start();
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  return { snap, error: loadError };
}

/** Sekündlicher Takt für Fortschritt und Countdowns. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
