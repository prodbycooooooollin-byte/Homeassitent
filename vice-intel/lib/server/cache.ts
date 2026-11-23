/** Small TTL + LRU cache for AI responses (keeps repeat questions free and instant). */
export class TTLCache<V> {
  private map = new Map<string, { v: V; exp: number }>();
  constructor(private max = 500, private ttlMs = 60 * 60 * 1000) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.v;
  }

  set(key: string, v: V) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { v, exp: Date.now() + this.ttlMs });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }
}
