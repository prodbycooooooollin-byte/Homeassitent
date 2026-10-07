import * as real from "./deadlock-api";
import { demoActive, demoHeroMeta, demoHistory, demoLeaderboard, demoMatch, demoProfiles, demoRank, demoSearch } from "../fixtures";
import type { HistoryEntry, MatchDetails } from "../types";

export { ApiError } from "./deadlock-api";
export type { ActiveMatchDto, HeroMeta, LeaderboardRow, SteamProfile } from "./deadlock-api";

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
export const fetchLeaderboard = (region: string) => (demo() ? Promise.resolve(demoLeaderboard()) : real.fetchLeaderboard(region));
