import { averageBadge } from "./ranks";
import { ratePlayer } from "./rating";
import { getStore } from "./store";
import type { Grade, HistoryEntry, MatchDetails } from "./types";

export interface MatchListItem {
  matchId: number;
  startTime: number;
  durationS: number;
  heroId: number;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  grade: Grade | null;
  score: number | null;
  lobbyBadge: number | null;
  detailsReady: boolean;
  /** Sekunden zwischen Spielende und Erkennung durch den Tracker (nur wenn live erkannt). */
  detectedAfterS: number | null;
  matchMode?: string;
}

export function lobbyBadge(d: MatchDetails | undefined): number | null {
  if (!d) return null;
  const fromTeams = averageBadge([...d.avgBadge]);
  return fromTeams ?? averageBadge(d.players.map((p) => p.badge));
}

export function listMatches(accountId: number): MatchListItem[] {
  const store = getStore();
  const items: MatchListItem[] = [];
  for (const rec of Object.values(store.matches)) {
    const h: HistoryEntry | undefined = rec.history[String(accountId)];
    if (!h) continue;
    const d = rec.details;
    const rating = d ? ratePlayer(d, accountId) : null;
    // Mit Details ist das Ergebnis maßgeblich, sonst Historie.
    const me = d?.players.find((p) => p.accountId === accountId);
    const won = d && d.winningTeam !== null && me ? d.winningTeam === me.team : h.won;
    const durationS = d?.durationS || h.durationS;
    const endMs = (h.startTime + durationS) * 1000;
    items.push({
      matchId: rec.matchId,
      startTime: h.startTime,
      durationS,
      heroId: me?.heroId ?? h.heroId,
      won,
      kills: me?.kills ?? h.kills,
      deaths: me?.deaths ?? h.deaths,
      assists: me?.assists ?? h.assists,
      netWorth: me?.netWorth ?? h.netWorth,
      grade: rating?.grade ?? null,
      score: rating?.score ?? null,
      lobbyBadge: lobbyBadge(d),
      detailsReady: !!d,
      detectedAfterS: rec.detectedLive && rec.firstSeenAt > endMs ? Math.round((rec.firstSeenAt - endMs) / 1000) : null,
      matchMode: h.matchMode,
    });
  }
  return items.sort((a, b) => b.startTime - a.startTime);
}

export interface Overview {
  matches: number;
  wins: number;
  winrate: number;
  kda: number;
  avgScore: number | null;
  gradeCounts: Record<Grade, number>;
  heroes: { heroId: number; matches: number; wins: number; kda: number }[];
}

export function overview(items: MatchListItem[]): Overview {
  const gradeCounts: Record<Grade, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
  const hero = new Map<number, { m: number; w: number; k: number; d: number; a: number }>();
  let k = 0, d = 0, a = 0, wins = 0;
  const scores: number[] = [];
  for (const it of items) {
    k += it.kills; d += it.deaths; a += it.assists;
    if (it.won) wins++;
    if (it.grade) gradeCounts[it.grade]++;
    if (it.score !== null) scores.push(it.score);
    const h = hero.get(it.heroId) ?? { m: 0, w: 0, k: 0, d: 0, a: 0 };
    h.m++; h.k += it.kills; h.d += it.deaths; h.a += it.assists;
    if (it.won) h.w++;
    hero.set(it.heroId, h);
  }
  return {
    matches: items.length,
    wins,
    winrate: items.length ? wins / items.length : 0,
    kda: (k + a) / Math.max(1, d),
    avgScore: scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null,
    gradeCounts,
    heroes: [...hero.entries()]
      .map(([heroId, h]) => ({ heroId, matches: h.m, wins: h.w, kda: (h.k + h.a) / Math.max(1, h.d) }))
      .sort((x, y) => y.matches - x.matches)
      .slice(0, 6),
  };
}
