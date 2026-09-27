import type {
  ItemEvent, MatchState, Obs, PlayerState, ProviderPlayer, ProviderSnapshot, SourceId, Team,
} from '../shared/types';
import { unknownObs } from '../shared/types';

// Validierter Matchzustand. Regeln:
//  - Neue Match-ID → vollständiger Reset (nichts wird übernommen).
//  - Snapshots mit älterer Spielzeit als der bekannte Stand werden verworfen (kein Rücksprung).
//  - Erster Inventar-Snapshot eines Spielers ist eine Basislinie: keine Kaufmeldungen.
//  - Unvollständige Snapshots fügen nur hinzu; fehlende Einträge gelten nicht als verkauft.
//  - Entfernen erst nach Bestätigung in mehreren vollständigen Snapshots.
//  - Verschwindet eine Komponente, während ein Item erscheint, das sie verbraucht → Upgrade.

export interface StoreOptions {
  /** Anzahl aufeinanderfolgender vollständiger Snapshots ohne das Item, bis es als entfernt gilt */
  removalConfirmations: number;
  /** Ab diesem Alter (ms) gelten Werte als veraltet – je Quelle */
  staleAfterMs: Record<SourceId, number>;
  /** Ausgebbare Souls veralten schneller (ms) */
  budgetStaleAfterMs: Record<SourceId, number>;
  componentsOf: (item: string) => string[];
  /** Listenpreis eines Items (für das berechnete Budget) */
  costOf?: (item: string) => number;
}

export const DEFAULT_STORE_OPTIONS: Omit<StoreOptions, 'componentsOf'> = {
  removalConfirmations: 2,
  // screen: Gegner-Items stammen aus der Tab-Ansicht und bleiben länger gültig; Souls veralten schnell
  staleAfterMs: { demo: 8000, manual: 10 * 60_000, spectator: 45_000, gep: 30_000, screen: 180_000 },
  budgetStaleAfterMs: { demo: 8000, manual: 90_000, spectator: 45_000, gep: 30_000, screen: 10_000 },
};

const obs = <T>(value: T, source: SourceId, at: number, gameTime: number | null, status: 'observed' | 'derived' = 'observed'): Obs<T> =>
  ({ value, status, source, observedAt: at, gameTime });

function emptyPlayer(key: string): PlayerState {
  return {
    key, isMe: false, team: unknownObs(), heroClass: unknownObs(), name: null, level: unknownObs(),
    kills: unknownObs(), deaths: unknownObs(), assists: unknownObs(), netWorth: unknownObs(),
    spendableSouls: unknownObs(), items: unknownObs(), pendingRemoval: {}, itemHistory: [], unknownItemIds: [],
    heroDamageTotal: unknownObs(), soldLoss: 0,
  };
}

export function emptyMatch(): MatchState {
  return {
    matchId: null, source: null, gameMode: null, gameTime: unknownObs(), sourceLagSec: null, myKey: null, players: {},
    extraSlots: unknownObs(), damageToMe: unknownObs(), reportedProblems: [], lastUpdateAt: null,
    stats: { snapshots: 0, rejectedOutOfOrder: 0, duplicates: 0, matchResets: 0 }, events: [],
  };
}

export interface ApplyResult { accepted: boolean; reason?: string; reset: boolean; events: ItemEvent[] }

export class MatchStore {
  state: MatchState = emptyMatch();
  private lastSignature = '';
  constructor(private opts: StoreOptions) {}

  reset() {
    const stats = { ...this.state.stats, matchResets: this.state.stats.matchResets + 1 };
    this.state = emptyMatch();
    this.state.stats = stats;
    this.lastSignature = '';
  }

  apply(s: ProviderSnapshot): ApplyResult {
    let reset = false;
    const st = this.state;
    if (st.matchId !== null && s.matchId !== st.matchId) { this.reset(); reset = true; }
    else if (st.source !== null && st.source !== s.source && s.matchId === null) { this.reset(); reset = true; }
    const state = this.state;
    state.stats.snapshots++;

    const gt = s.gameTime ?? null;
    const known = state.gameTime.value;
    if (gt !== null && known !== null && gt < known - 0.5) {
      state.stats.rejectedOutOfOrder++;
      return { accepted: false, reason: `veraltet (Spielzeit ${gt.toFixed(0)} s < ${known.toFixed(0)} s)`, reset, events: [] };
    }
    const signature = JSON.stringify({ ...s, receivedAt: 0 });
    if (signature === this.lastSignature) {
      state.stats.duplicates++;
      // Duplikat: nur Frische aktualisieren, keine Inhalte. Die Quelle hat die Werte erneut bestätigt.
      state.lastUpdateAt = s.receivedAt;
      for (const p of s.players) {
        const pl = state.players[p.key];
        if (!pl) continue;
        if (p.spendableSouls !== undefined && p.spendableSoulsAt === undefined) pl.spendableSouls = { ...pl.spendableSouls, status: 'observed', observedAt: s.receivedAt };
        if (p.items !== undefined && pl.items.value !== null) pl.items = { ...pl.items, status: 'observed', observedAt: s.receivedAt };
      }
      return { accepted: false, reason: 'Duplikat', reset, events: [] };
    }
    this.lastSignature = signature;

    state.matchId = s.matchId;
    state.source = s.source;
    state.gameMode = s.gameMode ?? state.gameMode;
    if (gt !== null) state.gameTime = obs(gt, s.source, s.receivedAt, gt);
    state.sourceLagSec = s.sourceLagSec ?? null;
    state.lastUpdateAt = s.receivedAt;

    const events: ItemEvent[] = [];
    for (const p of s.players) events.push(...this.applyPlayer(p, s, gt));

    if (s.extraSlotsByTeam) {
      const me = state.myKey ? state.players[state.myKey] : undefined;
      const team = me?.team.value;
      if (team !== null && team !== undefined && s.extraSlotsByTeam[team] !== undefined) {
        state.extraSlots = obs(s.extraSlotsByTeam[team]!, s.source, s.receivedAt, gt);
      }
    }
    if (s.damageToMe) state.damageToMe = obs(s.damageToMe, s.source, s.receivedAt, gt);
    if (s.reportedProblems) state.reportedProblems = s.reportedProblems.slice(-20);

    state.events.push(...events);
    if (state.events.length > 200) state.events.splice(0, state.events.length - 200);
    return { accepted: true, reset, events };
  }

  private applyPlayer(p: ProviderPlayer, s: ProviderSnapshot, gt: number | null): ItemEvent[] {
    const state = this.state;
    const pl = state.players[p.key] ?? (state.players[p.key] = emptyPlayer(p.key));
    const at = s.receivedAt;
    const src = s.source;
    if (p.isMe) { pl.isMe = true; state.myKey = p.key; }
    if (p.team !== undefined) pl.team = obs<Team>(p.team, src, at, gt);
    if (p.heroClass !== undefined) pl.heroClass = obs(p.heroClass, src, at, gt);
    if (p.name !== undefined) pl.name = p.name;
    if (p.level !== undefined) pl.level = obs(p.level, src, at, gt);
    if (p.kills !== undefined) pl.kills = obs(p.kills, src, at, gt);
    if (p.deaths !== undefined) pl.deaths = obs(p.deaths, src, at, gt);
    if (p.assists !== undefined) pl.assists = obs(p.assists, src, at, gt);
    if (p.netWorth !== undefined) pl.netWorth = obs(p.netWorth, src, at, gt);
    if (p.spendableSouls !== undefined) pl.spendableSouls = obs(p.spendableSouls, src, p.spendableSoulsAt ?? at, p.spendableSoulsAt !== undefined ? null : gt);
    if (p.heroDamageTotal !== undefined) pl.heroDamageTotal = obs(p.heroDamageTotal, src, at, gt);
    if (p.unknownItemIds) pl.unknownItemIds = [...new Set([...pl.unknownItemIds, ...p.unknownItemIds])].slice(-30);
    if (p.items === undefined) return [];
    return this.applyInventory(pl, p.items, p.itemsComplete === true, src, at, gt, s.purchasesKnown === true);
  }

  private applyInventory(pl: PlayerState, incoming: string[], complete: boolean, src: SourceId, at: number, gt: number | null, purchasesKnown: boolean): ItemEvent[] {
    const events: ItemEvent[] = [];
    const prev = pl.items.value;
    const next = new Set(incoming);

    if (prev === null) {
      // Basislinie: vorhandene Items einlesen, keine Kaufmeldungen erzeugen.
      pl.items = obs([...next], src, at, gt);
      for (const item of next) {
        const e: ItemEvent = { playerKey: pl.key, kind: 'initial', item, at, gameTime: gt, source: src };
        pl.itemHistory.push(e);
      }
      return events; // bewusst leer
    }

    const prevSet = new Set(prev);
    const added = [...next].filter((i) => !prevSet.has(i));
    const missing = [...prevSet].filter((i) => !next.has(i));
    const result = new Set(prevSet);

    // Upgrades: fehlende Komponente, die in einem neuen Item aufgeht
    const consumedBy = new Map<string, string[]>();
    for (const a of added) {
      const comps = this.opts.componentsOf(a).filter((c) => missing.includes(c));
      if (comps.length) consumedBy.set(a, comps);
    }
    const consumedAll = new Set([...consumedBy.values()].flat());

    for (const a of added) {
      result.add(a);
      delete pl.pendingRemoval[a];
      const consumed = consumedBy.get(a);
      const e: ItemEvent = consumed
        ? { playerKey: pl.key, kind: 'upgraded', item: a, consumed, at, gameTime: gt, source: src }
        : { playerKey: pl.key, kind: purchasesKnown ? 'purchased' : 'new-detected', item: a, at, gameTime: gt, source: src };
      events.push(e);
      pl.itemHistory.push(e);
    }
    for (const c of consumedAll) { result.delete(c); delete pl.pendingRemoval[c]; }

    if (complete) {
      for (const m of missing) {
        if (consumedAll.has(m)) continue;
        const n = (pl.pendingRemoval[m] ?? 0) + 1;
        if (n >= this.opts.removalConfirmations || src === 'manual') {
          result.delete(m);
          delete pl.pendingRemoval[m];
          const e: ItemEvent = { playerKey: pl.key, kind: 'no-longer-seen', item: m, at, gameTime: gt, source: src };
          pl.soldLoss += Math.floor((this.opts.costOf?.(m) ?? 0) / 2);
          events.push(e);
          pl.itemHistory.push(e);
        } else {
          pl.pendingRemoval[m] = n;
        }
      }
      // wieder gesehene Items → Bestätigung zurücksetzen
      for (const k of Object.keys(pl.pendingRemoval)) if (next.has(k)) delete pl.pendingRemoval[k];
    }
    pl.items = obs([...result], src, at, gt);
    if (pl.itemHistory.length > 120) pl.itemHistory.splice(0, pl.itemHistory.length - 120);
    return events;
  }

  /** Liefert den Zustand mit aktualisierten Verfügbarkeiten (veraltet) zum Zeitpunkt now. */
  view(now: number): MatchState {
    const s = this.state;
    const src = s.source;
    if (!src) return s;
    const staleMs = this.opts.staleAfterMs[src];
    const budgetMs = this.opts.budgetStaleAfterMs[src];
    const age = <T>(o: Obs<T>, limit: number): Obs<T> =>
      o.status === 'observed' && o.observedAt !== null && now - o.observedAt > limit ? { ...o, status: 'stale' } : o;
    const players: Record<string, PlayerState> = {};
    for (const [k, p] of Object.entries(s.players)) {
      players[k] = {
        ...p,
        level: age(p.level, staleMs), kills: age(p.kills, staleMs), deaths: age(p.deaths, staleMs), assists: age(p.assists, staleMs),
        netWorth: age(p.netWorth, staleMs), items: age(p.items, staleMs), spendableSouls: age(p.spendableSouls, budgetMs),
        heroDamageTotal: age(p.heroDamageTotal, staleMs),
      };
    }
    return { ...s, players, gameTime: age(s.gameTime, staleMs), damageToMe: age(s.damageToMe, 30_000) };
  }

  isStale(now: number): boolean {
    const s = this.state;
    if (!s.source || s.lastUpdateAt === null) return true;
    return now - s.lastUpdateAt > this.opts.staleAfterMs[s.source];
  }
}
