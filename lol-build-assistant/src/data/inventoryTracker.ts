import type { InventoryItem, ItemDef } from '../shared/types';

// Stabilisiert beobachtete Inventare über mehrere Abfragen.
// Grundsatz: fehlende oder unvollständige Listen sind KEIN Verkauf.

export interface InventoryEvent {
  playerId: string;
  kind: 'added' | 'upgrade' | 'removed-confirmed' | 'cleared-confirmed' | 'gap-detected';
  itemIds: number[];
  at: number;
  gameTime: number;
}

interface Tracked {
  stable: InventoryItem[];
  pendingRemoval: Map<number, number>; // itemId → seit (ms)
  emptySince: number | null;
}

export interface TrackerOptions {
  removalConfirmMs: number;
  emptyConfirmMs: number;
}

export const DEFAULT_TRACKER: TrackerOptions = { removalConfirmMs: 8000, emptyConfirmMs: 30000 };

function countMap(items: InventoryItem[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const it of items) m.set(it.itemId, (m.get(it.itemId) ?? 0) + Math.max(1, it.count));
  return m;
}

export class InventoryTracker {
  private players = new Map<string, Tracked>();
  readonly events: InventoryEvent[] = [];

  constructor(private items: Map<number, ItemDef>, private opts: TrackerOptions = DEFAULT_TRACKER) {}

  setItems(items: Map<number, ItemDef>) { this.items = items; }
  reset() { this.players.clear(); this.events.length = 0; }

  private isComponentOf(component: number, target: number, depth = 0): boolean {
    const it = this.items.get(target);
    if (!it || depth > 4) return false;
    return it.recipe.includes(component) || it.recipe.some((r) => this.isComponentOf(component, r, depth + 1));
  }

  private isConsumable(id: number): boolean {
    const t = this.items.get(id)?.tier;
    return t === 'consumable' || t === 'starter';
  }

  private emit(e: InventoryEvent) {
    this.events.push(e);
    if (this.events.length > 300) this.events.shift();
  }

  update(playerId: string, observed: InventoryItem[], now: number, gameTime: number): { items: InventoryItem[]; pendingRemovals: number[]; gap: boolean } {
    let t = this.players.get(playerId);
    if (!t) {
      t = { stable: observed.map((x) => ({ ...x })), pendingRemoval: new Map(), emptySince: null };
      this.players.set(playerId, t);
      return { items: t.stable, pendingRemovals: [], gap: false };
    }
    const nonTrinket = (xs: InventoryItem[]) => xs.filter((x) => x.slot !== 6);
    // Komplett leeres Inventar bei vorher vorhandenen Items: Datenlücke, kein Verkauf.
    if (nonTrinket(observed).length === 0 && nonTrinket(t.stable).length > 0) {
      if (t.emptySince === null) { t.emptySince = now; this.emit({ playerId, kind: 'gap-detected', itemIds: [], at: now, gameTime }); }
      if (now - t.emptySince < this.opts.emptyConfirmMs) return { items: t.stable, pendingRemovals: [], gap: true };
      this.emit({ playerId, kind: 'cleared-confirmed', itemIds: t.stable.map((x) => x.itemId), at: now, gameTime });
      t.stable = observed.map((x) => ({ ...x }));
      t.emptySince = null;
      return { items: t.stable, pendingRemovals: [], gap: false };
    }
    t.emptySince = null;

    const before = countMap(t.stable);
    const after = countMap(observed);
    const added: number[] = [];
    const removed: number[] = [];
    for (const [id, n] of after) for (let i = (before.get(id) ?? 0); i < n; i++) added.push(id);
    for (const [id, n] of before) for (let i = (after.get(id) ?? 0); i < n; i++) removed.push(id);

    const explained = new Set<number>();
    for (const r of removed) {
      if (added.some((a) => this.isComponentOf(r, a))) explained.add(r);
      else if (this.isConsumable(r)) explained.add(r);
    }
    const unexplained = removed.filter((r) => !explained.has(r));
    const confirmed: number[] = [];
    for (const r of unexplained) {
      const since = t.pendingRemoval.get(r);
      if (since === undefined) t.pendingRemoval.set(r, now);
      else if (now - since >= this.opts.removalConfirmMs) confirmed.push(r);
    }
    for (const id of [...t.pendingRemoval.keys()]) if (!unexplained.includes(id)) t.pendingRemoval.delete(id);

    if (added.length) this.emit({ playerId, kind: explained.size ? 'upgrade' : 'added', itemIds: added, at: now, gameTime });
    if (confirmed.length) this.emit({ playerId, kind: 'removed-confirmed', itemIds: confirmed, at: now, gameTime });

    // Neuer stabiler Zustand: Beobachtung, aber unbestätigte Entfernungen bleiben erhalten.
    const next = observed.map((x) => ({ ...x }));
    for (const r of unexplained) {
      if (confirmed.includes(r)) continue;
      const old = t.stable.find((x) => x.itemId === r);
      if (old) next.push({ ...old, slot: old.slot });
    }
    for (const c of confirmed) t.pendingRemoval.delete(c);
    t.stable = next;
    return { items: t.stable, pendingRemovals: [...t.pendingRemoval.keys()], gap: false };
  }
}

/** Goldrate aus beobachtetem Gold ohne Kaufsprünge. */
export class GoldRateTracker {
  private samples: { t: number; gold: number }[] = [];

  reset() { this.samples = []; }

  add(gameTime: number, gold: number) {
    const last = this.samples[this.samples.length - 1];
    if (last && gameTime < last.t) this.samples = [];
    this.samples.push({ t: gameTime, gold });
    while (this.samples.length && gameTime - this.samples[0].t > 120) this.samples.shift();
  }

  /** g/s oder null, wenn weniger als 20 s verwertbare Daten vorliegen. */
  rate(): number | null {
    let gain = 0; let span = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const d = this.samples[i].gold - this.samples[i - 1].gold;
      const dt = this.samples[i].t - this.samples[i - 1].t;
      if (dt <= 0 || dt > 10) continue;
      if (d >= 0) { gain += d; span += dt; } else span += dt; // Kauf: Zeit zählt, Gold-Abfluss nicht
    }
    return span >= 20 ? gain / span : null;
  }
}
