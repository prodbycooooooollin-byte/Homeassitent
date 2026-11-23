import type { LoadedData } from '../patch/patchData';
import { itemDisplayName } from '../patch/patchData';
import type { AdvisorSettings } from '../shared/types';
import { evaluate, type EngineResult, type EvaluationResult, type OptionEval } from './engine';
import type { EngineInput } from './input';

// Trennung: Datenabfrage (Poller) → Neuberechnung (evaluate) → sichtbare
// Benachrichtigung (Favoritenwechsel mit Hysterese + Änderungsverlauf).

export type Observation =
  | { kind: 'enemy-buy' | 'enemy-remove' | 'ally-buy' | 'ally-remove'; playerId: string; champion: string; itemId: number }
  | { kind: 'own-buy' | 'own-remove'; itemId: number }
  | { kind: 'enemy-level'; playerId: string; champion: string; from: number; to: number }
  | { kind: 'own-level'; from: number; to: number }
  | { kind: 'setting'; key: string; from: string; to: string }
  | { kind: 'data'; text: string };

export interface ItemRef {
  itemId: number;
  name: string;
  pathScore: number;
  offense: number;
  defense: number;
}

export interface ChangeRecord {
  id: number;
  at: number;
  gameTime: number;
  kind: 'initial' | 'switch' | 'kept' | 'completed' | 'invalidated' | 'pinned';
  from: ItemRef | null;
  to: ItemRef | null;
  triggers: string[];
  decisive: string[];
  tradeoff: string;
  summary: string;
}

export interface AdvisorOutput {
  result: EngineResult;
  favoriteId: number | null;
  /** Bester Kandidat ohne Hysterese – zur Transparenz. */
  rawBestId: number | null;
  pending: { itemId: number; name: string; lead: number; polls: number } | null;
  history: ChangeRecord[];
  lastChange: ChangeRecord | null;
  observationsSinceDecision: string[];
  recomputed: boolean;
}

interface Snapshot {
  myItems: number[];
  myLevel: number;
  players: Map<string, { champion: string; enemy: boolean; items: number[]; level: number; itemsKnown: boolean }>;
  settingsKey: Record<string, string>;
  goldBucket: number;
}

function diffItems(a: number[], b: number[]): { added: number[]; removed: number[] } {
  const rest = [...a];
  const added: number[] = [];
  for (const id of b) {
    const i = rest.indexOf(id);
    if (i >= 0) rest.splice(i, 1); else added.push(id);
  }
  return { added, removed: rest };
}

function settingsKey(s: AdvisorSettings): Record<string, string> {
  return {
    Rolle: String(s.roleOverride ?? 'auto'),
    Spielweise: String(s.playstyleOverride ?? 'auto'),
    Zielfokus: s.targetFocus,
    Fixierung: String(s.pinnedItem ?? '–'),
    Gegnerquelle: s.enemyItemPolicy,
  };
}

function snapshot(input: EngineInput, settings: AdvisorSettings): Snapshot {
  const players = new Map<string, Snapshot['players'] extends Map<string, infer V> ? V : never>();
  for (const e of input.enemies) players.set(e.id, { champion: e.championName, enemy: true, items: [...e.items], level: e.level, itemsKnown: e.itemsKnown });
  for (const a of input.allies) players.set(a.id, { champion: a.championName, enemy: false, items: [...a.items], level: a.level, itemsKnown: a.itemsKnown });
  return {
    myItems: [...input.me.items], myLevel: input.me.level, players, settingsKey: settingsKey(settings),
    goldBucket: Math.floor(input.me.gold / 100),
  };
}

export function observationText(o: Observation, name: (id: number) => string): string {
  switch (o.kind) {
    case 'enemy-buy': return `${o.champion} hat ${name(o.itemId)} (neu beobachtet)`;
    case 'enemy-remove': return `${o.champion}: ${name(o.itemId)} nicht mehr im Inventar`;
    case 'ally-buy': return `Mitspieler ${o.champion} hat ${name(o.itemId)}`;
    case 'ally-remove': return `Mitspieler ${o.champion}: ${name(o.itemId)} entfernt`;
    case 'own-buy': return `Du hast ${name(o.itemId)} gekauft`;
    case 'own-remove': return `${name(o.itemId)} nicht mehr in deinem Inventar`;
    case 'enemy-level': return `${o.champion} Level ${o.from} → ${o.to}`;
    case 'own-level': return `Dein Level ${o.from} → ${o.to}`;
    case 'setting': return `Einstellung ${o.key}: ${o.from} → ${o.to}`;
    case 'data': return o.text;
  }
}

/** Beobachtungen, die eine Neubewertung der offenen Kaufentscheidung auslösen. */
export function diffSnapshots(
  prev: Snapshot, next: Snapshot, lastEvalLevels: Map<string, number>, lastEvalMyLevel: number,
  isComponentOf: (component: number, item: number) => boolean = () => false,
): Observation[] {
  const obs: Observation[] = [];
  // Komponenten, die in einem neu gekauften Item aufgehen, sind kein eigenes Ereignis.
  const withoutUpgrades = (d: { added: number[]; removed: number[] }) => ({
    added: d.added, removed: d.removed.filter((r) => !d.added.some((a) => isComponentOf(r, a))),
  });
  const mine = withoutUpgrades(diffItems(prev.myItems, next.myItems));
  for (const id of mine.added) obs.push({ kind: 'own-buy', itemId: id });
  for (const id of mine.removed) obs.push({ kind: 'own-remove', itemId: id });
  for (const [id, p] of next.players) {
    const before = prev.players.get(id);
    if (!before) continue;
    if (before.itemsKnown || p.itemsKnown) {
      const d = withoutUpgrades(diffItems(before.items, p.items));
      for (const it of d.added) obs.push({ kind: p.enemy ? 'enemy-buy' : 'ally-buy', playerId: id, champion: p.champion, itemId: it });
      for (const it of d.removed) obs.push({ kind: p.enemy ? 'enemy-remove' : 'ally-remove', playerId: id, champion: p.champion, itemId: it });
    }
    const lastLevel = lastEvalLevels.get(id) ?? before.level;
    if (p.enemy && p.level - lastLevel >= 2) obs.push({ kind: 'enemy-level', playerId: id, champion: p.champion, from: lastLevel, to: p.level });
  }
  const crossed = [6, 11, 16].some((l) => lastEvalMyLevel < l && next.myLevel >= l);
  if (crossed || next.myLevel - lastEvalMyLevel >= 2) obs.push({ kind: 'own-level', from: lastEvalMyLevel, to: next.myLevel });
  for (const [k, v] of Object.entries(next.settingsKey)) {
    if (prev.settingsKey[k] !== v) obs.push({ kind: 'setting', key: k, from: prev.settingsKey[k], to: v });
  }
  return obs;
}

/** Nimmt eine Beobachtung im Engine-Input zurück (für Leave-one-out-Attribution). */
function revert(input: EngineInput, o: Observation): EngineInput | null {
  const clone: EngineInput = {
    ...input,
    enemies: input.enemies.map((e) => ({ ...e, items: [...e.items] })),
    allies: input.allies.map((a) => ({ ...a, items: [...a.items] })),
  };
  const list = o.kind === 'enemy-buy' || o.kind === 'enemy-remove' || o.kind === 'enemy-level' ? clone.enemies
    : o.kind === 'ally-buy' || o.kind === 'ally-remove' ? clone.allies : null;
  if (!list) return null;
  const p = list.find((x) => x.id === (o as { playerId: string }).playerId);
  if (!p) return null;
  if (o.kind === 'enemy-buy' || o.kind === 'ally-buy') {
    const i = p.items.indexOf(o.itemId);
    if (i < 0) return null;
    p.items.splice(i, 1);
  } else if (o.kind === 'enemy-remove' || o.kind === 'ally-remove') p.items.push(o.itemId);
  else if (o.kind === 'enemy-level') p.level = o.from;
  return clone;
}

function ref(o: OptionEval | undefined): ItemRef | null {
  if (!o) return null;
  return { itemId: o.itemId, name: o.name, pathScore: o.pathScore, offense: o.gains.offense, defense: o.gains.defense };
}

function tradeoffText(from: ItemRef | null, to: ItemRef | null): string {
  if (!from || !to) return '';
  const parts: string[] = [];
  const dOff = to.offense - from.offense;
  const dDef = to.defense - from.defense;
  if (Math.abs(dOff) > 0.01) parts.push(`${dOff > 0 ? '+' : ''}${Math.round(dOff * 100)} % Schaden`);
  if (Math.abs(dDef) > 0.01) parts.push(`${dDef > 0 ? '+' : ''}${Math.round(dDef * 100)} % eff. LP`);
  const lead = from.pathScore > 0 ? to.pathScore / from.pathScore - 1 : 0;
  return `${to.name} statt ${from.name}: ${parts.join(', ') || 'ähnliche Werte'}; Gesamtvorsprung ${Math.round(lead * 100)} %.`;
}

/** Für beibehaltene Pläne: was der Herausforderer besser/schlechter kann. */
function challengerText(fav: ItemRef, ch: ItemRef): string {
  const parts: string[] = [];
  const dOff = ch.offense - fav.offense;
  const dDef = ch.defense - fav.defense;
  if (Math.abs(dOff) > 0.01) parts.push(`${dOff > 0 ? '+' : ''}${Math.round(dOff * 100)} % Schaden`);
  if (Math.abs(dDef) > 0.01) parts.push(`${dDef > 0 ? '+' : ''}${Math.round(dDef * 100)} % eff. LP`);
  const gap = fav.pathScore > 0 ? ch.pathScore / fav.pathScore - 1 : 0;
  return `Herausforderer ${ch.name}: ${parts.join(', ') || 'ähnliche Werte'} ggü. ${fav.name}; Gesamtwert ${gap >= 0 ? '+' : ''}${Math.round(gap * 100)} %.`;
}

export class Advisor {
  private prev: Snapshot | null = null;
  private last: EngineResult | null = null;
  private favorite: number | null = null;
  private pending: { itemId: number; polls: number } | null = null;
  private pendingObs: Observation[] = [];
  /** Alle Beobachtungen seit Wahl des aktuellen Favoriten (für die Attribution). */
  private obsSinceFavorite: Observation[] = [];
  private lastEvalLevels = new Map<string, number>();
  private lastEvalMyLevel = 0;
  private seq = 0;
  readonly history: ChangeRecord[] = [];

  constructor(private data: LoadedData, private settings: AdvisorSettings) {}

  setData(data: LoadedData) { this.data = data; this.prev = null; }
  setSettings(s: AdvisorSettings) { this.settings = s; }
  getSettings(): AdvisorSettings { return this.settings; }

  reset() {
    this.prev = null; this.last = null; this.favorite = null; this.pending = null;
    this.pendingObs = []; this.obsSinceFavorite = []; this.history.length = 0; this.lastEvalLevels.clear(); this.lastEvalMyLevel = 0;
  }

  private name = (id: number) => itemDisplayName(this.data.patch.items.get(id), id);

  private isComponentOf = (component: number, item: number, depth = 0): boolean => {
    const it = this.data.patch.items.get(item);
    if (!it || depth > 4) return false;
    return it.recipe.includes(component) || it.recipe.some((r) => this.isComponentOf(component, r, depth + 1));
  };

  private record(r: Omit<ChangeRecord, 'id' | 'at'>, now: number): ChangeRecord {
    const rec = { ...r, id: ++this.seq, at: now };
    this.history.push(rec);
    if (this.history.length > 100) this.history.shift();
    return rec;
  }

  /**
   * Leave-one-out: Welche Beobachtungen seit Wahl des bisherigen Favoriten haben
   * den Wechsel verursacht? Jede Beobachtung wird im Input zurückgenommen und neu
   * gerechnet. Kippt keine einzeln, wird die Gesamtheit geprüft.
   */
  private attribute(input: EngineInput, prevFav: number, newFav: number): string[] {
    const current = this.last && this.last.ok ? this.last : null;
    const leadOf = (r: EngineResult | null) => {
      if (!r || !r.ok) return null;
      const a = r.options.find((x) => x.itemId === newFav);
      const b = r.options.find((x) => x.itemId === prevFav);
      return a && b ? { lead: a.pathScore - b.pathScore, base: b.pathScore, best: r.modelBestId } : null;
    };
    const now = leadOf(current);
    if (!now) return [];
    const singles: { o: Observation; shift: number; flips: boolean }[] = [];
    let cumulative: EngineInput | null = input;
    for (const o of this.obsSinceFavorite) {
      const reverted = revert(input, o);
      if (!reverted) continue;
      if (cumulative) cumulative = revert(cumulative, o) ?? cumulative;
      const w = leadOf(evaluate(reverted, this.data, this.settings, Date.now(), { lite: true }));
      if (!w) continue;
      singles.push({ o, shift: now.lead - w.lead, flips: w.lead <= 0 });
    }
    const decisive: string[] = [];
    const pts = (x: number) => `${(x / Math.max(1e-6, now.base) * 100).toFixed(1)} Prozentpunkte`;
    for (const s of singles.filter((x) => x.flips)) {
      decisive.push(`${observationText(s.o, this.name)} – ohne diese Beobachtung bliebe ${this.name(prevFav)} vorne.`);
    }
    if (!decisive.length && singles.length > 1 && cumulative && cumulative !== input) {
      const w = leadOf(evaluate(cumulative, this.data, this.settings, Date.now(), { lite: true }));
      if (w && w.lead <= 0) {
        const top = [...singles].sort((a, b) => b.shift - a.shift).filter((x) => x.shift > 0).slice(0, 3);
        decisive.push(`Mehrere Beobachtungen gemeinsam (einzeln jeweils unter der Wechselschwelle): ${top.map((x) => `${observationText(x.o, this.name)} (${pts(x.shift)})`).join('; ')}.`);
      }
    }
    for (const s of singles.filter((x) => !x.flips && x.shift > 0).sort((a, b) => b.shift - a.shift).slice(0, 3)) {
      if (decisive.some((d) => d.includes(observationText(s.o, this.name)))) continue;
      decisive.push(`${observationText(s.o, this.name)} – verschiebt den Vergleich um ${pts(s.shift)} zugunsten von ${this.name(newFav)}.`);
    }
    return decisive;
  }

  update(input: EngineInput, now: number = Date.now()): AdvisorOutput {
    const snap = snapshot(input, this.settings);
    const obs = this.prev ? diffSnapshots(this.prev, snap, this.lastEvalLevels, this.lastEvalMyLevel, this.isComponentOf) : [];
    const goldChanged = !this.prev || this.prev.goldBucket !== snap.goldBucket;
    const recompute = !this.last || obs.length > 0 || goldChanged || !!this.pending;
    this.prev = snap;
    if (obs.length) {
      this.pendingObs.push(...obs);
      this.obsSinceFavorite.push(...obs);
      for (const e of input.enemies) this.lastEvalLevels.set(e.id, e.level);
      if (obs.some((o) => o.kind === 'own-level')) this.lastEvalMyLevel = input.me.level;
    }
    if (!this.lastEvalMyLevel) this.lastEvalMyLevel = input.me.level;
    if (!this.lastEvalLevels.size) for (const e of input.enemies) this.lastEvalLevels.set(e.id, e.level);

    if (recompute) this.last = evaluate(input, this.data, this.settings, now);
    const result = this.last!;
    let lastChange: ChangeRecord | null = null;
    if (!result.ok) {
      return this.output(result, null, lastChange, recompute);
    }
    const best = result.options.find((o) => o.itemId === result.modelBestId);
    const fav = this.favorite !== null ? result.options.find((o) => o.itemId === this.favorite) : undefined;
    const obsTexts = this.pendingObs.map((o) => observationText(o, this.name));
    const canDecide = input.data.fresh;

    if (!best) {
      this.favorite = null;
      return this.output(result, null, lastChange, recompute);
    }
    if (this.favorite === null) {
      this.favorite = best.itemId;
      lastChange = this.record({
        gameTime: input.gameTime, kind: 'initial', from: null, to: ref(best), triggers: ['Erster vollständiger Datenstand'],
        decisive: [], tradeoff: '', summary: `Erster Vorschlag: ${best.name}.`,
      }, now);
      this.pendingObs = []; this.obsSinceFavorite = [];
    } else if (!fav) {
      // Favorit nicht mehr kaufbar: gekauft oder durch Beschränkung ausgeschlossen → sofort wechseln.
      const bought = input.me.items.includes(this.favorite);
      const oldName = this.name(this.favorite);
      lastChange = this.record({
        gameTime: input.gameTime, kind: bought ? 'completed' : 'invalidated',
        from: { itemId: this.favorite, name: oldName, pathScore: 0, offense: 0, defense: 0 }, to: ref(best),
        triggers: obsTexts, decisive: [],
        tradeoff: '',
        summary: bought ? `${oldName} gekauft – nächste Entscheidung: ${best.name}.` : `${oldName} ist nicht mehr kaufbar (${result.exclusions.find((x) => x.itemId === this.favorite)?.reason ?? 'ausgeschlossen'}) – neu: ${best.name}.`,
      }, now);
      this.favorite = best.itemId; this.pending = null; this.pendingObs = []; this.obsSinceFavorite = [];
    } else if (this.settings.pinnedItem && best.itemId === this.settings.pinnedItem && fav.itemId !== best.itemId) {
      lastChange = this.record({
        gameTime: input.gameTime, kind: 'pinned', from: ref(fav), to: ref(best), triggers: obsTexts, decisive: [],
        tradeoff: tradeoffText(ref(fav), ref(best)), summary: `${best.name} von dir fixiert.`,
      }, now);
      this.favorite = best.itemId; this.pending = null; this.pendingObs = []; this.obsSinceFavorite = [];
    } else if (best.itemId !== fav.itemId) {
      const lead = fav.pathScore > 0 ? best.pathScore / fav.pathScore - 1 : Infinity;
      const triggered = this.pendingObs.length > 0;
      if (!canDecide || !triggered) {
        // Keine neue Beobachtung (nur Gold/Budget) oder veraltete Daten: kein Favoritenwechsel.
        this.pending = null;
      } else if (lead >= this.settings.urgentMargin) {
        lastChange = this.switchTo(input, fav, best, lead, obsTexts, now, 'dringend');
      } else if (lead >= this.settings.switchMargin) {
        if (this.pending?.itemId === best.itemId) this.pending.polls++;
        else this.pending = { itemId: best.itemId, polls: 1 };
        if (this.pending.polls >= this.settings.stabilityPolls) lastChange = this.switchTo(input, fav, best, lead, obsTexts, now, 'stabil');
      } else {
        this.pending = null;
        if (this.pendingObs.some((o) => o.kind === 'enemy-buy' || o.kind === 'enemy-remove' || o.kind === 'setting')) {
          lastChange = this.record({
            gameTime: input.gameTime, kind: 'kept', from: ref(fav), to: ref(fav), triggers: obsTexts, decisive: [],
            tradeoff: challengerText(ref(fav)!, ref(best)!),
            summary: `Plan beibehalten: ${best.name} liegt nur ${Math.round(lead * 100)} % vorne (Schwelle ${Math.round(this.settings.switchMargin * 100)} %).`,
          }, now);
          this.pendingObs = [];
        }
      }
    } else {
      this.pending = null;
      if (this.pendingObs.some((o) => o.kind === 'enemy-buy' || o.kind === 'enemy-remove')) {
        const second = result.options.find((o) => o.itemId !== fav.itemId);
        lastChange = this.record({
          gameTime: input.gameTime, kind: 'kept', from: ref(fav), to: ref(fav), triggers: obsTexts, decisive: [],
          tradeoff: second ? challengerText(ref(fav)!, ref(second)!) : '',
          summary: `Neu bewertet, ${fav.name} bleibt vorne${second ? ` (vor ${second.name}, ${Math.round((fav.pathScore / Math.max(1e-6, second.pathScore) - 1) * 100)} % Vorsprung)` : ''}.`,
        }, now);
      }
      this.pendingObs = [];
    }
    // Details (Komponenten, Vorschau, Alternativen) beziehen sich auf den gehaltenen Favoriten.
    if (this.favorite !== null && result.bestId !== this.favorite) {
      this.last = evaluate(input, this.data, this.settings, now, { favorite: this.favorite });
    }
    return this.output(this.last!, this.favorite, lastChange, recompute);
  }

  private switchTo(input: EngineInput, fav: OptionEval, best: OptionEval, lead: number, obsTexts: string[], now: number, mode: string): ChangeRecord {
    const decisive = this.attribute(input, fav.itemId, best.itemId);
    const rec = this.record({
      gameTime: input.gameTime, kind: 'switch', from: ref(fav), to: ref(best), triggers: obsTexts, decisive,
      tradeoff: tradeoffText(ref(fav), ref(best)),
      summary: `${best.name} ersetzt ${fav.name} (${Math.round(lead * 100)} % Vorsprung, ${mode}).`,
    }, now);
    this.favorite = best.itemId; this.pending = null; this.pendingObs = []; this.obsSinceFavorite = [];
    return rec;
  }

  private output(result: EngineResult, favoriteId: number | null, lastChange: ChangeRecord | null, recomputed: boolean): AdvisorOutput {
    const pend = this.pending && result.ok ? (() => {
      const o = result.options.find((x) => x.itemId === this.pending!.itemId);
      const f = result.options.find((x) => x.itemId === favoriteId);
      return o && f ? { itemId: o.itemId, name: o.name, lead: f.pathScore > 0 ? o.pathScore / f.pathScore - 1 : 0, polls: this.pending!.polls } : null;
    })() : null;
    return {
      result, favoriteId, rawBestId: result.ok ? result.modelBestId : null, pending: pend,
      history: [...this.history], lastChange,
      observationsSinceDecision: this.pendingObs.map((o) => observationText(o, this.name)), recomputed,
    };
  }
}

export type { EvaluationResult };
