/**
 * Einfacher In-Memory Rate-Limiter (Sliding-Window-Zähler).
 *
 * Ausreichend für eine einzelne Node-Instanz (unser Setup: ein
 * durchgehender Prozess via server.ts, kein Serverless-Scale-Out). Für den
 * Betrieb mit mehreren Instanzen müsste dieser State in Redis o.ä. wandern
 * – die Schnittstelle (`consume`) ist bewusst so klein gehalten, dass sich
 * die Implementierung austauschen lässt, ohne Aufrufer anzufassen.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Verhindert unbegrenztes Wachstum der Map bei vielen unterschiedlichen Keys.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 30_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * @param key eindeutiger Schlüssel, z.B. `progress:${userId}:${roomId}`
 * @param limit maximale Anzahl Aktionen im Fenster
 * @param windowMs Fenstergröße in Millisekunden
 */
export function consumeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, retryAfterMs: 0 };
}

// Sinnvolle, vom Rest der App genutzte Presets.
export const RATE_LIMITS = {
  progressUpdate: { limit: 20, windowMs: 10_000 }, // 20 Klicks / 10s pro Nutzer+Raum
  authAttempt: { limit: 8, windowMs: 60_000 }, // Login/Registrierung
  passwordReset: { limit: 4, windowMs: 60_000 * 15 },
  joinAttempt: { limit: 10, windowMs: 60_000 },
  invite: { limit: 20, windowMs: 60_000 },
  general: { limit: 60, windowMs: 60_000 },
} as const;
