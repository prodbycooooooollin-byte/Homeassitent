import * as path from 'node:path';
import { Catalog } from '../src/gamedata/catalog';
import type { ProviderPlayer, ProviderSnapshot, ReportedProblem } from '../src/shared/types';

export const DATA_DIR = path.join(__dirname, '..', 'data');
let cached: Catalog | null = null;
export const catalog = () => (cached ??= Catalog.load(DATA_DIR));

/** Findet den Klassennamen zu einem englischen Itemnamen (Tests lesbar halten). */
export function I(name: string): string {
  const c = catalog();
  for (const it of c.items.values()) if (it.nameEn.toLowerCase() === name.toLowerCase()) return it.className;
  throw new Error(`Item nicht gefunden: ${name}`);
}
export function H(name: string): string {
  const c = catalog();
  for (const h of c.heroes.values()) if (h.nameEn.toLowerCase() === name.toLowerCase()) return h.className;
  throw new Error(`Hero nicht gefunden: ${name}`);
}

export interface Pl { hero: string; items?: string[]; nw?: number; k?: number; d?: number; a?: number; souls?: number; key?: string }

export function snap(opts: {
  me: Pl; allies?: Pl[]; enemies: Pl[]; t?: number; at?: number; matchId?: string; source?: ProviderSnapshot['source'];
  extraSlots?: number; problems?: Omit<ReportedProblem, 'at'>[]; itemsComplete?: boolean; noSouls?: boolean;
}): ProviderSnapshot {
  const at = opts.at ?? 1_000_000;
  const mk = (p: Pl, team: 0 | 1, key: string, isMe = false): ProviderPlayer => ({
    key: p.key ?? key, isMe, team, heroClass: H(p.hero), netWorth: p.nw, kills: p.k, deaths: p.d, assists: p.a,
    items: p.items?.map(I), itemsComplete: opts.itemsComplete ?? true,
    spendableSouls: isMe && !opts.noSouls ? p.souls : undefined,
  });
  return {
    source: opts.source ?? 'demo', matchId: opts.matchId ?? 'm1', receivedAt: at, gameTime: opts.t ?? 900,
    players: [mk(opts.me, 0, 'me', true), ...(opts.allies ?? []).map((p, i) => mk(p, 0, `a${i}`)), ...opts.enemies.map((p, i) => mk(p, 1, `e${i}`))],
    extraSlotsByTeam: opts.extraSlots !== undefined ? { 0: opts.extraSlots } : undefined,
    reportedProblems: opts.problems?.map((p) => ({ ...p, at })),
    purchasesKnown: (opts.source ?? 'demo') !== 'spectator',
  };
}
