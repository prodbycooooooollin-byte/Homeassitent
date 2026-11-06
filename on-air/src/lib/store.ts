import { useSyncExternalStore } from "react";
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
  // Sicherheitsnetz, falls ein Ereignis verloren geht (z. B. nach Standby) – nur sichtbar.
  setInterval(() => {
    if (!document.hidden) void refresh();
  }, 15_000);
  // Wieder sichtbar: sofort aktuellen Stand holen (verborgen wird nichts gezeichnet).
  document.addEventListener("visibilitychange", () => {
    document.documentElement.classList.toggle("is-hidden", document.hidden);
    if (!document.hidden) void refresh();
  });
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

/**
 * Gemeinsamer Takt je Intervall: ein Timer für alle Komponenten statt einer pro Komponente,
 * auf Intervallgrenzen ausgerichtet (alle Anzeigen springen gleichzeitig, React zeichnet
 * einmal) und angehalten, solange das Fenster verborgen ist.
 */
type Ticker = { now: number; subs: Set<() => void>; timer: ReturnType<typeof setTimeout> | null };
const tickers = new Map<number, Ticker>();

function schedule(ms: number, tk: Ticker) {
  if (tk.timer !== null || tk.subs.size === 0 || document.hidden) return;
  tk.timer = setTimeout(() => {
    tk.timer = null;
    tk.now = Date.now();
    tk.subs.forEach((f) => f());
    schedule(ms, tk);
  }, ms - (Date.now() % ms) + 5);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    tickers.forEach((tk, ms) => {
      if (document.hidden) {
        if (tk.timer !== null) clearTimeout(tk.timer);
        tk.timer = null;
      } else {
        tk.now = Date.now();
        tk.subs.forEach((f) => f());
        schedule(ms, tk);
      }
    });
  });
}

function ticker(ms: number): Ticker {
  let tk = tickers.get(ms);
  if (!tk) {
    tk = { now: Date.now(), subs: new Set(), timer: null };
    tickers.set(ms, tk);
  }
  return tk;
}

/** Takt für Fortschritt und Countdowns (Standard: 1 s). Statusanzeigen nutzen gröbere Takte. */
export function useNow(intervalMs = 1000): number {
  const tk = ticker(intervalMs);
  const now = useSyncExternalStore(
    (l) => {
      tk.subs.add(l);
      schedule(intervalMs, tk);
      return () => {
        tk.subs.delete(l);
        if (tk.subs.size === 0 && tk.timer !== null) {
          clearTimeout(tk.timer);
          tk.timer = null;
        }
      };
    },
    () => tk.now,
  );
  return now;
}
