/** Ringpuffer der letzten API-Aufrufe – für die Diagnose-Seite (Verbindungsprobleme sichtbar machen statt raten). */
export interface CallLog { at: number; path: string; status: number | "ERR"; ms: number; note?: string }
const g = globalThis as unknown as { __dlLog?: CallLog[] };
export function logCall(e: CallLog): void {
  const log = (g.__dlLog ??= []);
  log.unshift(e);
  if (log.length > 80) log.length = 80;
}
export const getCallLog = (): CallLog[] => g.__dlLog ?? [];

/** Sliding-Window-Budget für Steam-Fallback-Abrufe der Metadaten (API-Limit: 3 Anfragen pro Stunde und IP). */
const STEAM_BUDGET = 2;
const gs = globalThis as unknown as { __dlSteam?: number[] };
export function steamBudgetLeft(now = Date.now()): number {
  const calls = (gs.__dlSteam ??= []).filter((t) => now - t < 3600_000);
  gs.__dlSteam = calls;
  return Math.max(0, STEAM_BUDGET - calls.length);
}
export function useSteamBudget(now = Date.now()): void {
  (gs.__dlSteam ??= []).push(now);
}
