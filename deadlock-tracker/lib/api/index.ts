import * as real from "./deadlock-api";
import { demoActive, demoBuilds, demoHeroMeta, demoHistory, demoLeaderboard, demoMatch, demoMates, demoMatchups, demoProfiles, demoRank, demoSearch, demoTopItems } from "../fixtures";
import type { HistoryEntry, MatchDetails } from "../types";

export { ApiError } from "./deadlock-api";
export type { ActiveMatchDto, BadgeBucket, BuildDto, HeroMeta, LeaderboardRow, MateRow, MatchupRow, SteamProfile } from "./deadlock-api";

const demo = () => process.env.DEADLOCK_DEMO === "1";

export const isDemo = demo;
export const fetchHistory = (id: number): Promise<HistoryEntry[]> => (demo() ? Promise.resolve(demoHistory(id)) : real.fetchHistory(id));
export const fetchMatchDetails = (matchId: number, focus = 1, allowSteam = false): Promise<MatchDetails | null> =>
  demo() ? Promise.resolve(demoMatch(matchId, focus)) : real.fetchMatchDetails(matchId, allowSteam);
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
