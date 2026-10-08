import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ details: null as any }));
vi.mock("./api", () => ({
  ApiError: class ApiError extends Error { constructor(m: string, public status?: number, public retryAfterS?: number) { super(m); } },
  fetchHistory: async () => [],
  fetchMatchDetails: async () => api.details,
  fetchProfiles: async () => [],
  fetchRank: async () => null,
  fetchActive: async () => [],
}));
vi.mock("./store", async () => {
  const store = { version: 1, players: {}, matches: {} } as any;
  return { getStore: () => store, saveStore: () => {} };
});

import { hintMatch, hintStatus, processHints } from "./sync";
import { getStore } from "./store";

const details = (id: number, accounts: number[]) => ({
  v: 5, matchId: id, startTime: 1000, durationS: 1800, winningTeam: 0, matchMode: "Ranked", gameMode: "", avgBadge: [null, null], objectives: [],
  players: accounts.map((a, i) => ({ accountId: a, team: (i % 2) as 0 | 1, heroId: 1, kills: 1, deaths: 1, assists: 1, level: 1, netWorth: 1, lastHits: 1, denies: 0, heroDamage: 1, objectiveDamage: 0, healing: 0, damageTaken: 0, badge: null, abandoned: false })),
});

describe("Match-Hinweise", () => {
  beforeEach(() => { const s = getStore(); s.players = { "1": { accountId: 1, name: "Ich", addedAt: 0 } }; s.matches = {}; api.details = null; });

  it("lädt ein Match, sobald es verfügbar wird, und markiert es als live erkannt", async () => {
    expect(hintMatch(555000001, "cache", 0)).toBe(true);
    expect(hintMatch(555000001, "cache", 0)).toBe(false); // doppelt
    await processHints(1000);
    expect(getStore().matches[555000001]).toBeUndefined(); // noch nicht verfügbar
    expect(hintStatus().find((h) => h.matchId === 555000001)?.tries).toBe(1);
    api.details = details(555000001, [1, 2, 3, 4]);
    await processHints(1000 + 60_000);
    const rec = getStore().matches[555000001];
    expect(rec?.details).toBeTruthy();
    expect(rec?.detectedLive).toBe(true);
    expect(hintStatus().find((h) => h.matchId === 555000001)?.done).toBe("ok");
  });

  it("verwirft Matches, in denen kein getrackter Spieler vorkommt", async () => {
    hintMatch(555000002, "ingest", 0);
    api.details = details(555000002, [7, 8, 9, 10]);
    await processHints(1000);
    expect(hintStatus().find((h) => h.matchId === 555000002)?.done).toBe("fremd");
    expect(getStore().matches[555000002]).toBeUndefined();
  });
});
