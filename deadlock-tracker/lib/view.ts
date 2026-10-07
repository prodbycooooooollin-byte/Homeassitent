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
  myBadge: number | null;
  /** Rating-Teilwerte (KDA, Kill-Beteiligung, Souls/Min, Schaden/Heilung, Objective) */
  parts: number[] | null;
  rankedDelta: number | null;
  team: 0 | 1;
  level: number;
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
      matchMode: d?.matchMode ?? h.matchMode,
      team: me?.team ?? h.team,
      level: me?.level ?? h.heroLevel,
      myBadge: h.badge ?? me?.badge ?? null,
      parts: rating ? rating.parts.map((x) => Math.round(x.value * 100) / 100) : null,
      rankedDelta: h.rankedDelta ?? null,
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
  /** Letzte bekannte Rang-Badge des Spielers */
  currentBadge: number | null;
  /** Rang-Verlauf (älteste zuerst) */
  rankHistory: { t: number; badge: number; matchId: number; lobby: number | null; delta: number | null; won: boolean }[];
  /** Letzte 20 Ergebnisse, neueste zuerst */
  form: boolean[];
  /** Rating-Scores der letzten 30 bewerteten Matches, älteste zuerst */
  trend: number[];
}

export function overview(items: MatchListItem[], accountId?: number): Overview {
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
      .slice(0, 8),
    currentBadge: items.find((i) => i.myBadge)?.myBadge ?? (accountId ? getStore().players[String(accountId)]?.rank?.badge : undefined) ?? null,
    rankHistory: items.filter((i) => i.myBadge).slice(0, 120).map((i) => ({ t: i.startTime, badge: i.myBadge as number, matchId: i.matchId, lobby: i.lobbyBadge, delta: i.rankedDelta, won: i.won })).reverse(),
    form: items.slice(0, 20).map((i) => i.won),
    trend: items.filter((i) => i.score !== null).slice(0, 30).map((i) => i.score as number).reverse(),
  };
}

export interface HeroAgg {
  heroId: number;
  matches: number;
  wins: number;
  kda: number;
  avgScore: number | null;
  soulsPerMin: number;
  bestGrade: Grade | null;
  lastPlayed: number;
}

const GRADE_ORDER: Grade[] = ["S", "A", "B", "C", "D", "F"];

export function heroAggregates(items: MatchListItem[]): HeroAgg[] {
  const m = new Map<number, { n: number; w: number; k: number; d: number; a: number; scores: number[]; souls: number; mins: number; best: number; last: number }>();
  for (const it of items) {
    const h = m.get(it.heroId) ?? { n: 0, w: 0, k: 0, d: 0, a: 0, scores: [], souls: 0, mins: 0, best: 99, last: 0 };
    h.n++; h.k += it.kills; h.d += it.deaths; h.a += it.assists;
    if (it.won) h.w++;
    if (it.score !== null) h.scores.push(it.score);
    h.souls += it.netWorth; h.mins += it.durationS / 60;
    if (it.grade) h.best = Math.min(h.best, GRADE_ORDER.indexOf(it.grade));
    h.last = Math.max(h.last, it.startTime);
    m.set(it.heroId, h);
  }
  return [...m.entries()].map(([heroId, h]) => ({
    heroId, matches: h.n, wins: h.w, kda: (h.k + h.a) / Math.max(1, h.d),
    avgScore: h.scores.length ? h.scores.reduce((x, y) => x + y, 0) / h.scores.length : null,
    soulsPerMin: h.mins ? h.souls / h.mins : 0,
    bestGrade: h.best < 99 ? GRADE_ORDER[h.best] : null,
    lastPlayed: h.last,
  })).sort((a, b) => b.matches - a.matches || b.lastPlayed - a.lastPlayed);
}

export interface MateAgg { accountId: number; name?: string; avatar?: string; games: number; wins: number; heroIds: number[] }

/** Mitspieler (gleiches Team) über alle Matches mit vollständigen Details. */
export function mates(accountId: number, minGames = 2): MateAgg[] {
  const agg = new Map<number, MateAgg>();
  for (const rec of Object.values(getStore().matches)) {
    const d = rec.details;
    const me = d?.players.find((p) => p.accountId === accountId);
    if (!d || !me) continue;
    const won = d.winningTeam === me.team;
    for (const p of d.players) {
      if (p.accountId === accountId || p.team !== me.team || !p.accountId) continue;
      const a = agg.get(p.accountId) ?? { accountId: p.accountId, name: p.name, avatar: p.avatar, games: 0, wins: 0, heroIds: [] };
      a.games++; if (won) a.wins++;
      a.name = p.name ?? a.name; a.avatar = p.avatar ?? a.avatar;
      if (!a.heroIds.includes(p.heroId)) a.heroIds.push(p.heroId);
      agg.set(p.accountId, a);
    }
  }
  return [...agg.values()].filter((a) => a.games >= minGames).sort((a, b) => b.games - a.games).slice(0, 40);
}
