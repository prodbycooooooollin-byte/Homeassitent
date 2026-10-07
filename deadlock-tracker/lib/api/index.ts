import * as real from "./deadlock-api";
import { demoHistory, demoMatch, demoProfiles } from "../fixtures";
import type { HistoryEntry, MatchDetails } from "../types";

export { ApiError } from "./deadlock-api";
export type { HeroInfo, SteamProfile } from "./deadlock-api";

const demo = () => process.env.DEADLOCK_DEMO === "1";

export const isDemo = demo;
export const fetchHistory = (id: number): Promise<HistoryEntry[]> =>
  demo() ? Promise.resolve(demoHistory(id)) : real.fetchHistory(id);
export const fetchMatchDetails = (matchId: number, focus = 1): Promise<MatchDetails | null> =>
  demo() ? Promise.resolve(demoMatch(matchId, focus)) : real.fetchMatchDetails(matchId);
export const fetchProfiles = (ids: number[]) =>
  demo() ? Promise.resolve(demoProfiles(ids)) : real.fetchProfiles(ids);
