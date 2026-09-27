import type { Catalog } from '../gamedata/catalog';
import type { EnemyAlert, ItemEvent, MatchState, NeedKey } from '../shared/types';
import { type Assessment, NEED_KEYS, assess } from './assess';
import type { Weights } from './weights';

// Dezente Hinweise bei entscheidenden gegnerischen Käufen:
//  - nur neue Käufe/Upgrades (nie die Basislinie des ersten Snapshots)
//  - Relevanz = Bedrohung des Käufers × Veränderung meines Bedarfs durch das Item
//  - enge Folgekäufe werden gebündelt, Doppelmeldungen unterdrückt, globale Abkühlzeit

interface Pending { enemyKey: string; items: string[]; kinds: ItemEvent['kind'][]; firstAt: number; relevance: number; consequence: string }

const CONSEQUENCE: Partial<Record<NeedKey, [string, string]>> = {
  antiHeal: ['Heilungsreduktion erhält höhere Priorität.', 'Heilungsreduktion gewinnt etwas an Wert.'],
  ccDefense: ['Mehr Kontrolle – CC-Schutz wird wichtiger.', 'Etwas mehr Kontrolle zu erwarten.'],
  bulletDefense: ['Deutlich mehr Waffenschaden gegen dich zu erwarten.', 'Etwas mehr Waffenschaden zu erwarten.'],
  spiritDefense: ['Deutlich mehr Spirit-Schaden gegen dich zu erwarten.', 'Etwas mehr Spirit-Schaden zu erwarten.'],
  meleeDefense: ['Mehr Nahkampfdruck zu erwarten.', 'Etwas mehr Nahkampfdruck.'],
  burstDefense: ['Burst-Gefahr steigt deutlich.', 'Burst-Gefahr steigt leicht.'],
};

function withoutItems(state: MatchState, enemyKey: string, items: string[]): MatchState {
  const p = state.players[enemyKey];
  if (!p || !p.items.value) return state;
  return { ...state, players: { ...state.players, [enemyKey]: { ...p, items: { ...p.items, value: p.items.value.filter((i) => !items.includes(i)) } } } };
}

export function alertImpact(cat: Catalog, w: Weights, state: MatchState, enemyKey: string, items: string[], now: number, after?: Assessment) {
  const a1 = after ?? assess(cat, state, w, now);
  const a0 = assess(cat, withoutItems(state, enemyKey, items), w, now);
  const deltas = NEED_KEYS.filter((k) => k !== 'offense' && k !== 'mobility').map((k) => ({ k, d: a1.needs.values[k] - a0.needs.values[k] }));
  const def = [
    { k: 'enemyBulletResist', d: a1.enemyBulletResist - a0.enemyBulletResist, text: 'Mehr Bullet-Resistenz beim Gegner – Durchdringung gewinnt an Wert.' },
    { k: 'enemySpiritResist', d: a1.enemySpiritResist - a0.enemySpiritResist, text: 'Mehr Spirit-Resistenz beim Gegner – Durchdringung gewinnt an Wert.' },
    { k: 'enemyCcImmunity', d: a1.enemyCcImmunity - a0.enemyCcImmunity, text: 'Deine Kontrolle wirkt gegen ihn schlechter.' },
    { k: 'enemyAntiHeal', d: a1.enemyAntiHeal - a0.enemyAntiHeal, text: 'Deine Heilung wird reduziert.' },
  ];
  const needTop = deltas.sort((x, y) => y.d - x.d)[0];
  const defTop = def.sort((x, y) => y.d - x.d)[0];
  const threat = a1.threats.find((t) => t.key === enemyKey)?.threat ?? 0.3;
  const needMag = deltas.reduce((s, x) => s + Math.max(0, x.d), 0);
  const defMag = def.reduce((s, x) => s + Math.max(0, x.d), 0) * 0.6;
  const relevance = (0.4 + 0.6 * threat) * (needMag + defMag);
  const consequence = needTop && needTop.d >= (defTop?.d ?? 0) * 0.6 && needTop.d > 0.01
    ? (CONSEQUENCE[needTop.k]?.[needTop.d >= 0.1 ? 0 : 1] ?? 'Neubewertung.')
    : defTop && defTop.d > 0.01 ? defTop.text : 'Geringe Auswirkung auf deine Kaufentscheidung.';
  return { relevance, consequence, threat };
}

export class AlertManager {
  private pending = new Map<string, Pending>();
  private seen = new Set<string>();
  private lastEmitAt = 0;
  private matchId: string | null = null;
  history: EnemyAlert[] = [];

  constructor(private cat: Catalog, private w: Weights) {}

  reset() { this.pending.clear(); this.seen.clear(); this.lastEmitAt = 0; this.history = []; }

  /** Neue Item-Ereignisse verarbeiten; gibt fällige Hinweise zurück. */
  process(state: MatchState, events: ItemEvent[], now: number, recommendationChange: (() => string | null) | null): EnemyAlert[] {
    if (state.matchId !== this.matchId) { this.reset(); this.matchId = state.matchId; }
    const me = state.myKey ? state.players[state.myKey] : undefined;
    const myTeam = me?.team.value ?? null;
    for (const e of events) {
      if (e.kind === 'initial' || e.kind === 'no-longer-seen') continue;
      const p = state.players[e.playerKey];
      if (!p || p.isMe || myTeam === null || p.team.value === null || p.team.value === myTeam) continue;
      const key = `${e.playerKey}:${e.item}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      const cur = this.pending.get(e.playerKey) ?? { enemyKey: e.playerKey, items: [], kinds: [], firstAt: now, relevance: 0, consequence: '' };
      cur.items.push(e.item);
      cur.kinds.push(e.kind);
      this.pending.set(e.playerKey, cur);
    }
    const out: EnemyAlert[] = [];
    for (const [k, p] of [...this.pending]) {
      if (now - p.firstAt < this.w.alerts.bundleMs) continue;
      this.pending.delete(k);
      const imp = alertImpact(this.cat, this.w, state, p.enemyKey, p.items, now);
      if (imp.relevance < this.w.alerts.minRelevance) continue;
      if (now - this.lastEmitAt < this.w.alerts.cooldownMs && out.length === 0 && this.history.length) {
        // Abkühlzeit: nur deutlich relevantere Hinweise dürfen durch
        const last = this.history[this.history.length - 1];
        if (imp.relevance < last.relevance * 1.5) continue;
      }
      const pl = state.players[p.enemyKey];
      const wording: EnemyAlert['wording'] = p.kinds.includes('upgraded') ? 'Upgrade erkannt' : p.kinds.every((x) => x === 'purchased') ? 'gekauft' : 'neu erkannt';
      const alert: EnemyAlert = {
        id: `${p.enemyKey}-${now}`, enemyKey: p.enemyKey, heroName: this.cat.heroName(pl?.heroClass.value), items: p.items, wording,
        consequence: imp.consequence, changedRecommendation: (recommendationChange ? recommendationChange() : null) ?? 'Dein Kaufplan bleibt.', at: now, relevance: imp.relevance,
      };
      out.push(alert);
    }
    if (out.length) {
      out.sort((x, y) => y.relevance - x.relevance);
      const top = out.slice(0, 2); // höchstens zwei gleichzeitig
      this.lastEmitAt = now;
      this.history.push(...top);
      if (this.history.length > 30) this.history.splice(0, this.history.length - 30);
      return top;
    }
    return [];
  }
}
