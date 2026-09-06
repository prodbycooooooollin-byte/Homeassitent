/**
 * Zeit-Hilfsfunktionen. Grundsatz: Für Timer-Berechnungen und die
 * Gewinner-Ermittlung ist ausschließlich die Serverzeit (`new Date()` auf
 * dem Server bzw. `now()` in der Datenbank) maßgeblich – Clients senden nie
 * eigene Zeitstempel für sicherheitsrelevante Werte.
 */

export interface ChallengeTiming {
  status: string;
  startedAt: Date | null;
  pausedAt: Date | null;
  totalPausedMs: bigint | number;
  endedAt: Date | null;
  timeLimitMinutes?: number | null;
}

/** Verstrichene Zeit in Millisekunden, unter Berücksichtigung von Pausen. */
export function computeElapsedMs(challenge: ChallengeTiming, now: Date = new Date()): number {
  if (!challenge.startedAt) return 0;
  const end = challenge.endedAt ?? now;
  const paused = Number(challenge.totalPausedMs ?? 0);
  const currentlyPausedExtra =
    challenge.status === "PAUSED" && challenge.pausedAt
      ? Math.max(0, end.getTime() - challenge.pausedAt.getTime())
      : 0;
  const raw = end.getTime() - challenge.startedAt.getTime() - paused - currentlyPausedExtra;
  return Math.max(0, raw);
}

export function computeRemainingMs(challenge: ChallengeTiming, now: Date = new Date()): number | null {
  if (!challenge.timeLimitMinutes) return null;
  const limitMs = challenge.timeLimitMinutes * 60_000;
  return Math.max(0, limitMs - computeElapsedMs(challenge, now));
}

/** "1:23:04" bzw. "04:12" für Anzeigen unter einer Stunde. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Kurzform relativer Zeit auf Deutsch, z.B. "vor 3 Min.". */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 5) return "gerade eben";
  if (diffSec < 60) return `vor ${diffSec} Sek.`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `vor ${diffHr} Std.`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `vor ${diffDay} Tag${diffDay === 1 ? "" : "en"}`;
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Formatiert einen Zeitpunkt in der Zeitzone des Betrachters (Browser-Intl). */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
