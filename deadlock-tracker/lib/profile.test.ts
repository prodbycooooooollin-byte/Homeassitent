import { describe, expect, it } from "vitest";
import { achievements, activity, byDuration, byLobbyStrength, currentSession, insights, longestWinStreak, radar, records, streak } from "./profile";
import type { MatchListItem } from "./view";

let id = 0;
const M = (o: Partial<MatchListItem> = {}): MatchListItem => ({
  matchId: ++id, startTime: 1_000_000, durationS: 1800, heroId: 1, won: true, kills: 5, deaths: 3, assists: 4, netWorth: 30000, grade: "B", score: 1.0,
  lobbyBadge: 63, detailsReady: true, detectedAfterS: null, myBadge: 63, parts: [1, 1, 1, 1, 1], rankedDelta: null, team: 0, level: 20, ...o,
});

describe("profile analytics", () => {
  it("streaks", () => {
    expect(streak([M(), M(), M({ won: false })])).toBe(2);
    expect(streak([M({ won: false }), M({ won: false }), M({ won: false }), M()])).toBe(-3);
    expect(longestWinStreak([M(), M(), M({ won: false }), M(), M(), M()].reverse())).toBe(3);
  });
  it("session groups matches with short gaps and ignores old ones", () => {
    const t = 2_000_000;
    const items = [M({ startTime: t, durationS: 1800 }), M({ startTime: t - 3600, durationS: 1800 }), M({ startTime: t - 50_000, durationS: 1800 })];
    const s = currentSession(items, t + 2400)!;
    expect(s.matches).toHaveLength(2);
    expect(currentSession(items, t + 10 * 3600)).toBeNull();
  });
  it("records pick the best match", () => {
    const r = records([M({ kills: 4 }), M({ kills: 18 })]);
    expect(r.find((x) => x.key === "kills")?.value).toBe("18");
  });
  it("buckets and lobby strength", () => {
    expect(byDuration([M({ durationS: 1000 }), M({ durationS: 3000 })]).map((b) => b.n)).toEqual([1, 0, 0, 1]);
    const ls = byLobbyStrength([M({ lobbyBadge: 41, myBadge: 63 }), M({ lobbyBadge: 63 }), M({ lobbyBadge: 85, won: false })]);
    expect(ls.map((b) => b.n)).toEqual([1, 1, 1]);
    expect(ls[2].wins).toBe(0);
  });
  it("radar averages the rating parts", () => {
    const r = radar([M({ parts: [1, 2, 1, 1, 1] }), M({ parts: [1, 0, 1, 1, 1] })])!;
    expect(r.values[1]).toBe(1);
  });
  it("activity covers whole weeks ending today", () => {
    const a = activity([M({ startTime: Math.floor(Date.now() / 1000) })], 4);
    expect(a.length).toBeGreaterThanOrEqual(22);
    expect(a[a.length - 1].n).toBe(1);
  });
  it("insights and achievements", () => {
    const items = Array.from({ length: 8 }, () => M({ won: false }));
    expect(insights(items, () => "X").some((i) => i.text.includes("Niederlagen in Folge"))).toBe(true);
    const ach = achievements([M({ kills: 20, grade: "S" })]);
    expect(ach.find((a) => a.key === "kills15")?.progress).toBe(15);
    expect(ach.find((a) => a.key === "s1")?.progress).toBe(1);
  });
});
