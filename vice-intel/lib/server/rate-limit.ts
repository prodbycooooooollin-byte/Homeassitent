/**
 * Sliding-window rate limiter.
 *
 * In-memory per server instance — adequate for a single node and for local
 * development. For multi-instance deployments implement `RateLimitStore`
 * against Redis/Upstash and pass it in; the call sites do not change.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): number[];
}

class MemoryStore implements RateLimitStore {
  private hits = new Map<string, number[]>();
  hit(key: string, windowMs: number, now: number) {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.every((t) => now - t >= windowMs)) this.hits.delete(k);
    }
    return list;
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function createRateLimiter(opts: { limit: number; windowMs: number; store?: RateLimitStore }) {
  const store = opts.store ?? new MemoryStore();
  return (key: string, now = Date.now()): RateLimitResult => {
    const hits = store.hit(key, opts.windowMs, now);
    const ok = hits.length <= opts.limit;
    const oldest = hits[0] ?? now;
    return {
      ok,
      remaining: Math.max(0, opts.limit - hits.length),
      retryAfterSec: ok ? 0 : Math.ceil((opts.windowMs - (now - oldest)) / 1000),
    };
  };
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return ip;
}
