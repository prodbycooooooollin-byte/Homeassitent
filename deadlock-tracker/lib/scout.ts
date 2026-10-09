import { fetchCounters, fetchProfiles, fetchRanks, fetchScoutHistory } from "./api";
import { getAssets } from "./assets";
import { analyzePlayer, lobbyBaseline, scoutInsights, summarizeTeam, winChance, type PlayerFacts, type ScoutPlayer, type TeamSummary } from "./live";
import type { HistoryEntry } from "./types";

export interface ScoutInput { accountId: number; heroId: number; team: 0 | 1; name?: string; avatar?: string }
export interface ScoutResult {
  players: ScoutPlayer[];
  /** Zusammenfassung je Team (Index = Team) */
  teams: [TeamSummary, TeamSummary];
  myTeam: 0 | 1;
  /** Geschätzte Gewinnchance des eigenen Teams (nur wenn `me` bekannt und beide Teams Daten haben) */
  winChance: number | null;
  /** Dein Held gegen die gegnerischen Helden (globale Ranked-Daten) */
  matchups: { heroId: number; wr: number; matches: number }[];
  insights: string[];
  /** Wie viele Spieler-Historien nicht geladen werden konnten */
  missing: number;
}

const HIST_TTL = 10 * 60_000;
const hist = new Map<number, { at: number; h: HistoryEntry[] | null }>();

async function history(id: number): Promise<HistoryEntry[] | null> {
  const hit = hist.get(id);
  if (hit && Date.now() - hit.at < (hit.h ? HIST_TTL : 60_000)) return hit.h;
  let h: HistoryEntry[] | null = null;
  try { h = await fetchScoutHistory(id); } catch { /* privat / Rate-Limit */ }
  hist.set(id, { at: Date.now(), h });
  return h;
}

/** Führt `fn` für alle Elemente aus, höchstens `limit` gleichzeitig. */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const cache = new Map<string, { at: number; r: ScoutResult }>();

export async function scout(input: ScoutInput[], me?: number): Promise<ScoutResult> {
  const key = input.map((p) => `${p.accountId}:${p.heroId}:${p.team}`).join(",") + `|${me ?? 0}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20_000) return hit.r;

  const ids = [...new Set(input.map((p) => p.accountId).filter((x) => x > 0))];
  const [profiles, ranks, assets] = await Promise.all([fetchProfiles(ids), fetchRanks(ids), getAssets()]);
  const prof = new Map(profiles.map((p) => [p.accountId, p]));
  const hists = new Map<number, HistoryEntry[] | null>();
  await pool(ids, 4, async (id) => { hists.set(id, await history(id)); });

  const heroName = (id: number) => assets.heroes[id]?.name ?? "diesen Helden";
  const facts: PlayerFacts[] = input.map((p) => ({
    accountId: p.accountId, heroId: p.heroId, team: p.team,
    name: p.name ?? prof.get(p.accountId)?.name, avatar: p.avatar ?? prof.get(p.accountId)?.avatar,
    badge: ranks.get(p.accountId) ?? prof.get(p.accountId)?.lastTeamAvgBadge ?? null,
    history: p.accountId > 0 ? hists.get(p.accountId) ?? null : null,
  }));
  const base = lobbyBaseline(facts);
  const players = facts.map((f) => analyzePlayer(f, base, heroName(f.heroId), f.accountId === me));
  const myTeam = (players.find((p) => p.isMe)?.team ?? 0) as 0 | 1;
  const teams: [TeamSummary, TeamSummary] = [summarizeTeam(players.filter((p) => p.team === 0)), summarizeTeam(players.filter((p) => p.team === 1))];

  // Held-Matchup: globale Ranked-Winrate deines Helden gegen die gegnerischen Helden
  let matchups: ScoutResult["matchups"] = [];
  const mine = players.find((p) => p.isMe);
  if (mine && mine.heroId > 0) {
    try {
      const c = await fetchCounters(mine.heroId);
      const enemyHeroes = new Set(players.filter((p) => p.team !== myTeam).map((p) => p.heroId));
      matchups = c.filter((x) => enemyHeroes.has(x.heroId) && x.matches >= 30).map((x) => ({ heroId: x.heroId, wr: x.wins / x.matches, matches: x.matches }));
    } catch { /* optional */ }
  }
  const edge = matchups.length ? matchups.reduce((a, m) => a + (m.wr - 0.5), 0) / matchups.length : 0;
  const mineSum = teams[myTeam], enemySum = teams[myTeam === 0 ? 1 : 0];
  const haveData = mineSum.avgBadge !== null || mineSum.avgWr !== null;
  const result: ScoutResult = {
    players, teams, myTeam,
    winChance: me && haveData ? winChance(mineSum, enemySum, edge) : null,
    matchups, insights: scoutInsights(players, heroName, mineSum, enemySum),
    missing: players.filter((p) => p.games === null).length,
  };
  cache.set(key, { at: Date.now(), r: result });
  return result;
}
