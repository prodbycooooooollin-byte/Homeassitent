import type { PatchStatus } from '../patch/patchData';
import type {
  AdvisorSettings, ActivePlayerState, MatchState, PlayerState, Provenance, Role, TeamId,
} from '../shared/types';

/** Entscheidungsrelevante, bereits stabilisierte Sicht auf einen Champion. */
export interface EngineChampion {
  id: string;
  championKey: string;
  championName: string;
  team: TeamId;
  role: Role | null;
  level: number;
  /** Item-IDs (Duplikate möglich, Trinket/Verbrauchsgüter bereits entfernt). */
  items: number[];
  /** false = Inventar dieses Champions ist für die Engine unbekannt (nicht leer!). */
  itemsKnown: boolean;
  itemsProvenance: Provenance;
  scores: { kills: number; deaths: number; assists: number; creepScore: number };
}

export interface EngineInput {
  gameTime: number;
  mapNumber: number;
  gameMode: string;
  patchStatus: PatchStatus;
  me: {
    id: string;
    championKey: string;
    championName: string;
    role: Role | null;
    level: number;
    gold: number;
    items: number[];
    observedStats?: ActivePlayerState['stats'];
    abilityRanks?: ActivePlayerState['abilityRanks'];
    statsProvenance: Provenance;
  };
  allies: EngineChampion[];
  enemies: EngineChampion[];
  goldRate: { value: number; kind: 'observed' | 'estimated' };
  data: { fresh: boolean; ageSec: number; status: MatchState['feed']['status']; mode: MatchState['mode'] };
}

/** Manuell gepflegte Gegnerinventare, key = championKey. */
export type ManualEnemyItems = Record<string, { items: number[]; updatedAt: number; gameTime?: number }>;

// Trinkets und Verbrauchsgüter sind für Kaufentscheidungen irrelevant und belegen
// (Trinket) keinen normalen Slot. Unbekannte IDs bleiben erhalten und werden
// später als "unbekannt" markiert statt verworfen.
const IGNORED_ITEMS = new Set([3340, 3363, 3364, 3330, 2003, 2031, 2033, 2055, 2138, 2139, 2140, 2010]);

export function relevantItems(p: PlayerState): number[] {
  const out: number[] = [];
  for (const it of p.items) {
    if (it.slot === 6 || IGNORED_ITEMS.has(it.itemId)) continue;
    out.push(it.itemId);
  }
  return out;
}

/** Geschätzte Goldrate, falls keine beobachtete vorliegt (dokumentierte Annahme). */
export function fallbackGoldRate(role: Role | null, gameTime: number): number {
  const passive = gameTime > 110 ? 2.04 : 0;
  const farm: Record<Role, number> = { TOP: 3.4, JUNGLE: 3.1, MIDDLE: 3.5, BOTTOM: 3.6, UTILITY: 1.3 };
  return passive + (role ? farm[role] : 3.2);
}

export function buildEngineInput(
  state: MatchState,
  settings: AdvisorSettings,
  manual: ManualEnemyItems,
  patchStatus: PatchStatus,
  now: number = Date.now(),
): EngineInput | null {
  const mePlayer = state.players.find((p) => p.id === state.me.id);
  if (!mePlayer) return null;
  const myTeam = mePlayer.team;
  const toEngine = (p: PlayerState): EngineChampion => {
    const isEnemy = p.team !== myTeam;
    let items = relevantItems(p);
    let itemsKnown = true;
    let prov = p.itemsProvenance;
    if (isEnemy && settings.enemyItemPolicy === 'manual' && state.mode === 'live') {
      const m = manual[p.championKey];
      items = m ? [...m.items] : [];
      itemsKnown = !!m;
      prov = m
        ? { kind: 'observed', source: 'manual', at: m.updatedAt, gameTime: m.gameTime }
        : { kind: 'unknown', source: 'manual', at: now, note: 'Keine manuelle Eingabe' };
    }
    return {
      id: p.id, championKey: p.championKey, championName: p.championName, team: p.team,
      role: p.position, level: p.level, items, itemsKnown, itemsProvenance: prov, scores: p.scores,
    };
  };
  const others = state.players.filter((p) => p.id !== state.me.id);
  const role = settings.roleOverride ?? mePlayer.position;
  const ageSec = state.feed.lastSuccessAt ? Math.max(0, (now - state.feed.lastSuccessAt) / 1000) : Infinity;
  const fresh = state.mode === 'simulation' || (state.feed.status === 'live' && ageSec < 10);
  return {
    gameTime: state.gameTime,
    mapNumber: state.mapNumber,
    gameMode: state.gameMode,
    patchStatus,
    me: {
      id: state.me.id,
      championKey: mePlayer.championKey,
      championName: mePlayer.championName,
      role,
      level: state.me.level,
      gold: state.me.gold,
      items: relevantItems(mePlayer),
      observedStats: state.me.stats,
      abilityRanks: state.me.abilityRanks,
      statsProvenance: state.me.statsProvenance,
    },
    allies: others.filter((p) => p.team === myTeam).map(toEngine),
    enemies: others.filter((p) => p.team !== myTeam).map(toEngine),
    goldRate: state.goldRate
      ? { value: state.goldRate.value, kind: 'observed' }
      : { value: fallbackGoldRate(role, state.gameTime), kind: 'estimated' },
    data: { fresh, ageSec, status: state.feed.status, mode: state.mode },
  };
}
