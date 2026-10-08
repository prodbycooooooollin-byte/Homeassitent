import * as real from "./deadlock-api";
import { demoActive, demoBuilds, demoRanks, demoScoutHistory, demoHeroMeta, demoHistory, demoLeaderboard, demoMatch, demoMates, demoMatchups, demoProfiles, demoRank, demoSearch, demoTopItems } from "../fixtures";
import type { HistoryEntry, MatchDetails } from "../types";

export { ApiError } from "./deadlock-api";
export type { CurvePoint, ActiveMatchDto, BadgeBucket, BuildDto, HeroMeta, LeaderboardRow, MateRow, MatchupRow, SteamProfile } from "./deadlock-api";

const demo = () => process.env.DEADLOCK_DEMO === "1";

export const isDemo = demo;
export const fetchHistory = (id: number): Promise<HistoryEntry[]> => (demo() ? Promise.resolve(demoHistory(id)) : real.fetchHistory(id));
export const fetchMatchDetails = (matchId: number, focus = 1, allowSteam = false): Promise<MatchDetails | null> =>
  demo() ? Promise.resolve(demoMatch(matchId, focus)) : real.fetchMatchDetails(matchId, allowSteam);
export const fetchReplayUrl = (matchId: number): Promise<{ url: string } | { error: string }> => (demo() ? Promise.resolve({ error: "Demo-Modus" }) : real.fetchReplayUrl(matchId));
export const fetchProfiles = (ids: number[]) => (demo() ? Promise.resolve(demoProfiles(ids)) : real.fetchProfiles(ids));
export const searchProfiles = (q: string) => (demo() ? Promise.resolve(demoSearch(q)) : real.searchProfiles(q));
export const fetchRank = (id: number) => (demo() ? Promise.resolve(demoRank) : real.fetchRank(id));
export const fetchActive = (ids: number[]) =>
  demo() ? Promise.resolve(ids.flatMap((i) => { const m = demoActive(i); return m ? [m] : []; })) : real.fetchActive(ids);
export const fetchHeroMeta = () => (demo() ? Promise.resolve(demoHeroMeta()) : real.fetchHeroMeta());
export const fetchBadgeDistribution = () =>
  demo() ? Promise.resolve(Array.from({ length: 11 }, (_, t) => Array.from({ length: 6 }, (_, k) => ({ badge: (t + 1) * 10 + k + 1, players: Math.round(4000 * Math.exp(-Math.pow((t - 4) / 2.6, 2))) }))).flat()) : real.fetchBadgeDistribution();
export const fetchLeaderboard = (region: string, heroId?: number) => (demo() ? Promise.resolve(demoLeaderboard(heroId)) : real.fetchLeaderboard(region, heroId));
export const fetchMates = (id: number, kind: "mates" | "enemies" | "party") => (demo() ? Promise.resolve(demoMates(kind)) : real.fetchMates(id, kind));
export const fetchBuilds = (heroId: number) => (demo() ? Promise.resolve(demoBuilds(heroId)) : real.fetchBuilds(heroId));
export const fetchTopItems = (heroId: number) => (demo() ? Promise.resolve(demoTopItems(heroId)) : real.fetchTopItems(heroId));
export const fetchCounters = (heroId: number) => (demo() ? Promise.resolve(demoMatchups(heroId)) : real.fetchCounters(heroId));
export const fetchSynergies = (heroId: number) => (demo() ? Promise.resolve(demoMatchups(heroId + 1)) : real.fetchSynergies(heroId));
export const fetchRanks = (ids: number[]) => (demo() ? Promise.resolve(demoRanks(ids)) : real.fetchRanks(ids));
/** Historie für das Scouting fremder Spieler (im Demo-Modus mit unterschiedlichen Profilen). */
export const fetchScoutHistory = (id: number): Promise<HistoryEntry[]> => (demo() ? Promise.resolve(demoScoutHistory(id)) : real.fetchHistory(id));
export const fetchPerformanceCurve = (heroId: number | null, minBadge: number, maxBadge: number) =>
  demo()
    ? Promise.resolve(Array.from({ length: 11 }, (_, i) => { const f = i / 10; return { pct: i * 10, nw: [38000 * Math.pow(f, 1.25), 3500 * f + 300] as [number, number], k: [7.5 * f, 2 * f + 0.3] as [number, number], d: [5.5 * f, 1.6 * f + 0.3] as [number, number], a: [10 * f, 3 * f + 0.4] as [number, number], dmg: [24000 * Math.pow(f, 1.15), 4200 * f + 300] as [number, number] }; }))
    : real.fetchPerformanceCurve(heroId, minBadge, maxBadge);
