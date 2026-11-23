import type { MatchState, PlayerState, Role, TeamId } from '../shared/types';

// Getrennter Simulationsmodus: alle Daten sind als "simulation" gekennzeichnet und
// werden nie mit Live-Daten vermischt.

export interface SimChampion {
  champion: string;
  name?: string;
  role?: Role;
  level: number;
  items: number[];
  kills?: number;
  deaths?: number;
  assists?: number;
}

export interface SimChange {
  who: string; // championKey oder "me"
  add?: number[];
  remove?: number[];
  level?: number;
  gold?: number;
}

export interface SimStep {
  t: number;
  label: string;
  changes: SimChange[];
}

export interface SimScenario {
  id: string;
  name: string;
  description?: string;
  gameVersion?: string | null;
  gameTime: number;
  goldRate?: number;
  mapNumber?: number;
  me: SimChampion & { gold: number };
  allies: SimChampion[];
  enemies: SimChampion[];
  timeline?: SimStep[];
}

export interface SimCursor {
  step: number; // -1 = Ausgangszustand
  manual: SimChange[];
}

interface MutableTeam { me: SimChampion & { gold: number }; allies: SimChampion[]; enemies: SimChampion[]; gameTime: number }

function applyChange(team: MutableTeam, c: SimChange) {
  const target = c.who === 'me' ? team.me
    : [...team.allies, ...team.enemies].find((x) => x.champion === c.who);
  if (!target) throw new Error(`Simulation: unbekannter Champion '${c.who}'`);
  for (const id of c.remove ?? []) {
    const i = target.items.indexOf(id);
    if (i >= 0) target.items.splice(i, 1);
  }
  for (const id of c.add ?? []) target.items.push(id);
  if (c.level !== undefined) target.level = c.level;
  if (c.gold !== undefined && c.who === 'me') team.me.gold = c.gold;
}

export function resolveSim(s: SimScenario, cursor: SimCursor): MutableTeam {
  const team: MutableTeam = {
    me: { ...s.me, items: [...s.me.items] },
    allies: s.allies.map((a) => ({ ...a, items: [...a.items] })),
    enemies: s.enemies.map((a) => ({ ...a, items: [...a.items] })),
    gameTime: s.gameTime,
  };
  const steps = s.timeline ?? [];
  for (let i = 0; i <= cursor.step && i < steps.length; i++) {
    for (const c of steps[i].changes) applyChange(team, c);
    team.gameTime = steps[i].t;
  }
  for (const c of cursor.manual) applyChange(team, c);
  return team;
}

function toPlayer(c: SimChampion, team: TeamId, id: string, now: number, gameTime: number): PlayerState {
  return {
    id,
    championKey: c.champion,
    championName: c.name ?? c.champion,
    team,
    position: c.role ?? null,
    level: c.level,
    items: c.items.map((itemId, slot) => ({ itemId, count: 1, slot })),
    itemsProvenance: { kind: 'observed', source: 'simulation', at: now, gameTime },
    scores: { kills: c.kills ?? 0, deaths: c.deaths ?? 0, assists: c.assists ?? 0, creepScore: 0 },
    isDead: false,
    isBot: false,
  };
}

export function simToMatchState(s: SimScenario, cursor: SimCursor, now: number = Date.now()): MatchState {
  const t = resolveSim(s, cursor);
  const players: PlayerState[] = [
    toPlayer(t.me, 'ORDER', 'me', now, t.gameTime),
    ...t.allies.map((a, i) => toPlayer(a, 'ORDER', `ally-${i}-${a.champion}`, now, t.gameTime)),
    ...t.enemies.map((e, i) => toPlayer(e, 'CHAOS', `enemy-${i}-${e.champion}`, now, t.gameTime)),
  ];
  return {
    mode: 'simulation',
    feed: { status: 'simulation', lastSuccessAt: now },
    gameTime: t.gameTime,
    gameMode: 'CLASSIC',
    mapNumber: s.mapNumber ?? 11,
    gameVersion: s.gameVersion ?? null,
    gameVersionProvenance: { kind: s.gameVersion ? 'observed' : 'unknown', source: 'simulation', at: now },
    me: {
      id: 'me',
      gold: t.me.gold,
      level: t.me.level,
      statsProvenance: { kind: 'derived', source: 'simulation', at: now, note: 'Simulation: Werte aus Basiswerten + Items' },
    },
    players,
    goldRate: s.goldRate
      ? { value: s.goldRate, provenance: { kind: 'observed', source: 'simulation', at: now } }
      : undefined,
  };
}
