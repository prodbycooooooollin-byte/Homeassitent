/** Einfacher Token-Bucket je Schlüssel (Socket, IP, Ereignis). */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly now: () => number = Date.now
  ) {}

  take(key: string, cost = 1): boolean {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: t };
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.at) / 1000) * this.refillPerSec);
    b.at = t;
    if (b.tokens < cost) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= cost;
    this.buckets.set(key, b);
    return true;
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }

  /** Entfernt volle, lange unbenutzte Buckets (Speicherbegrenzung). */
  sweep(): void {
    const t = this.now();
    for (const [k, b] of this.buckets) if (t - b.at > 10 * 60_000) this.buckets.delete(k);
  }

  get size(): number {
    return this.buckets.size;
  }
}
