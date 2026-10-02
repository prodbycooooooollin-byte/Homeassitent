import type { ActivePlayerState, PlayerState, Provenance, Role, StatBlock } from '../shared/types';
import type { RawActivePlayer, RawChampionStats, RawPlayer } from './liveClient';

const ROLES: Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

/** "game_character_displayname_MonkeyKing" → "MonkeyKing"; Fallback: Anzeigename ohne Sonderzeichen. */
export function championKeyOf(p: Pick<RawPlayer, 'rawChampionName' | 'championName'>): string {
  const raw = p.rawChampionName ?? '';
  const m = /game_character_displayname_(\w+)/.exec(raw);
  if (m) return m[1];
  return p.championName.replace(/[^A-Za-z]/g, '');
}

export function playerId(p: { riotId?: string; summonerName?: string; riotIdGameName?: string }): string {
  return p.riotId || p.summonerName || p.riotIdGameName || 'unbekannt';
}

export function normalizePlayer(p: RawPlayer, prov: Provenance): PlayerState {
  const pos = (p.position ?? '').toUpperCase();
  return {
    id: playerId(p),
    championKey: championKeyOf(p),
    championName: p.championName,
    team: p.team,
    position: (ROLES as string[]).includes(pos) ? (pos as Role) : null,
    level: p.level,
    items: (p.items ?? []).map((i) => ({ itemId: i.itemID, count: i.count ?? 1, slot: i.slot, displayName: i.displayName })),
    itemsProvenance: prov,
    scores: {
      kills: p.scores?.kills ?? 0, deaths: p.scores?.deaths ?? 0,
      assists: p.scores?.assists ?? 0, creepScore: p.scores?.creepScore ?? 0,
    },
    isDead: !!p.isDead,
    isBot: !!p.isBot,
    keystone: p.runes?.keystone?.displayName,
  };
}

/**
 * Die API liefert Durchdringung in Prozent als verbleibenden Anteil (1.0 = keine
 * Durchdringung). Diese Semantik ist in der Datenmatrix als "zu prüfen" markiert;
 * Werte außerhalb von (0, 1] werden nicht interpretiert.
 */
function penFromRemaining(v: number | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (v > 0 && v <= 1) return 1 - v;
  return undefined;
}

export function normalizeStats(s: RawChampionStats): ActivePlayerState['stats'] {
  const critDamage = s.critDamage === undefined ? undefined : s.critDamage > 10 ? s.critDamage / 100 : s.critDamage;
  const out: StatBlock & { attackSpeedTotal?: number; critDamageTotal?: number } = {
    ad: s.attackDamage,
    ap: s.abilityPower,
    attackSpeedTotal: s.attackSpeed,
    crit: s.critChance === undefined ? undefined : s.critChance > 1 ? s.critChance / 100 : s.critChance,
    critDamageTotal: critDamage,
    hp: s.maxHealth,
    armor: s.armor,
    mr: s.magicResist,
    mana: s.resourceType === 'MANA' ? s.resourceMax : 0,
    ah: s.abilityHaste,
    lethality: s.physicalLethality,
    armorPenPct: penFromRemaining(s.armorPenetrationPercent),
    magicPenFlat: s.magicPenetrationFlat,
    magicPenPct: penFromRemaining(s.magicPenetrationPercent),
    lifesteal: s.lifeSteal,
    tenacity: s.tenacity === undefined ? undefined : s.tenacity > 1 ? s.tenacity / 100 : s.tenacity,
  };
  return out;
}

export function normalizeActive(a: RawActivePlayer, prov: Provenance): ActivePlayerState {
  const ranks: ActivePlayerState['abilityRanks'] = {};
  for (const k of ['Q', 'W', 'E', 'R'] as const) {
    const v = a.abilities?.[k]?.abilityLevel;
    if (typeof v === 'number') ranks[k] = v;
  }
  return {
    id: playerId(a),
    gold: a.currentGold,
    level: a.level,
    stats: normalizeStats(a.championStats ?? {}),
    statsProvenance: prov,
    abilityRanks: Object.keys(ranks).length ? ranks : undefined,
  };
}

// ---------------------------------------------------------------------------
// Schema-Prüfung zur Laufzeit → Teil der Datenverfügbarkeitsmatrix
// ---------------------------------------------------------------------------

export interface FieldCheck { field: string; present: boolean; sample?: string }

export function checkSchema(active: RawActivePlayer | null, players: RawPlayer[] | null): FieldCheck[] {
  const checks: FieldCheck[] = [];
  const has = (field: string, v: unknown) => checks.push({ field, present: v !== undefined && v !== null, sample: v === undefined ? undefined : String(typeof v === 'object' ? JSON.stringify(v).slice(0, 40) : v) });
  has('activeplayer.currentGold', active?.currentGold);
  has('activeplayer.level', active?.level);
  has('activeplayer.championStats.armor', active?.championStats?.armor);
  has('activeplayer.championStats.armorPenetrationPercent', active?.championStats?.armorPenetrationPercent);
  has('activeplayer.championStats.physicalLethality', active?.championStats?.physicalLethality);
  has('activeplayer.championStats.magicPenetrationPercent', active?.championStats?.magicPenetrationPercent);
  has('activeplayer.abilities', active?.abilities);
  has('activeplayer.riotId', active?.riotId ?? active?.summonerName);
  const p = players?.[0];
  has('playerlist[].rawChampionName', p?.rawChampionName);
  has('playerlist[].position', p?.position);
  has('playerlist[].items', p?.items);
  has('playerlist[].level', p?.level);
  has('playerlist[].scores', p?.scores);
  has('playerlist[].runes.keystone', p?.runes?.keystone);
  return checks;
}
