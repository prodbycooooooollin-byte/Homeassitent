import { beforeEach, describe, expect, it, vi } from "vitest";

const hist = vi.hoisted(() => ({ entries: [] as any[], details: null as any, fail: false }));
vi.mock("./api", () => ({
  ApiError: class ApiError extends Error { constructor(m: string, public status?: number, public retryAfterS?: number) { super(m); } },
  fetchHistory: async () => {
    if (hist.fail) throw new Error("API down");
    return hist.entries;
  },
  fetchMatchDetails: async () => hist.details,
  fetchProfiles: async () => [],
  fetchRank: async () => null,
  fetchActive: async () => [],
}));
vi.mock("./store", async () => {
  const store = { version: 1, players: {}, matches: {} } as any;
  return { getStore: () => store, saveStore: () => {} };
});

import { addPlayer, enrichMatch, nextAttemptDelayMs, syncPlayer } from "./sync";
import { getStore } from "./store";

const entry = (id: number) => ({
  matchId: id, accountId: 1, heroId: 1, startTime: 1000 + id, durationS: 1800, won: true, team: 0,
  kills: 1, deaths: 1, assists: 1, netWorth: 1, lastHits: 1, denies: 0, heroLevel: 1, abandoned: false,
});

describe("sync", () => {
  beforeEach(() => {
    const s = getStore();
    s.players = {};
    s.matches = {};
    hist.fail = false;
    hist.details = null;
  });

  it("first import is silent, later new matches are reported exactly once", async () => {
    await addPlayer(1);
    hist.entries = [entry(1), entry(2)];
    expect((await syncPlayer(1)).newMatches).toEqual([]);
    expect(Object.keys(getStore().matches)).toHaveLength(2);
    hist.entries = [entry(1), entry(2), entry(3)];
    expect((await syncPlayer(1)).newMatches).toEqual([3]);
    expect((await syncPlayer(1)).newMatches).toEqual([]);
  });

  it("an API outage never loses matches: next successful sync catches up", async () => {
    await addPlayer(1);
    hist.entries = [entry(1)];
    await syncPlayer(1);
    hist.fail = true;
    const r = await syncPlayer(1);
    expect(r.error).toBe("API down");
    expect(getStore().players["1"].lastSyncOk).toBe(false);
    hist.fail = false;
    hist.entries = [entry(1), entry(2), entry(3), entry(4)];
    expect((await syncPlayer(1)).newMatches.sort()).toEqual([2, 3, 4]);
  });

  it("details missing -> backoff retry; once available they are stored", async () => {
    await addPlayer(1);
    hist.entries = [entry(1)];
    await syncPlayer(1);
    const now = 5_000_000;
    expect(await enrichMatch(1, now)).toBe(false);
    const rec = getStore().matches[1];
    expect(rec.nextDetailsAttemptAt).toBe(now + nextAttemptDelayMs(1));
    hist.details = { matchId: 1, startTime: 1, durationS: 1, winningTeam: 0, avgBadge: [null, null], players: [] };
    expect(await enrichMatch(1, now + 60_000)).toBe(true);
    expect(rec.details).toBeDefined();
  });

  it("backoff grows and caps", () => {
    expect(nextAttemptDelayMs(0)).toBe(10_000);
    expect(nextAttemptDelayMs(99)).toBe(900_000);
  });
});
