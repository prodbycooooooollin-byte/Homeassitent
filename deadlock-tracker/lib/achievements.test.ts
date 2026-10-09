import { describe, expect, it } from "vitest";
import { evaluate, SERIES, summarize, TIERS } from "./achievements";
import type { MatchListItem, Overview } from "./view";

let id = 0;
const M = (o: Partial<MatchListItem> = {}): MatchListItem => ({
  matchId: ++id, startTime: 1_700_000_000 + id * 3600, durationS: 1800, heroId: 1, won: true, kills: 5, deaths: 3, assists: 4, netWorth: 30000, grade: "B", score: 1.0,
  lobbyBadge: 63, detailsReady: true, detectedAfterS: null, myBadge: 63, parts: null, rankedDelta: null, team: 0, level: 20, role: "carry", ...o,
});
const OV = { currentBadge: 63, rankHistory: [{ t: 1, badge: 41, matchId: 1, lobby: null, delta: null, won: true }, { t: 2, badge: 55, matchId: 2, lobby: null, delta: null, won: true }, { t: 3, badge: 52, matchId: 3, lobby: null, delta: null, won: false }] } as unknown as Overview;

describe("achievements", () => {
  it("has plenty of series with ascending targets and unique keys", () => {
    expect(SERIES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(SERIES.map((s) => s.key)).size).toBe(SERIES.length);
    for (const s of SERIES) expect([...s.targets].sort((a, b) => a - b)).toEqual(s.targets);
    expect(SERIES.flatMap((s) => s.targets).length).toBeGreaterThanOrEqual(80);
    for (const s of SERIES) expect(s.targets.length).toBeLessThanOrEqual(TIERS.length);
  });
  it("tiers, progress and next target", () => {
    const items = Array.from({ length: 30 }, () => M());
    const st = evaluate(items, OV).find((s) => s.series.key === "matches")!;
    expect(st.value).toBe(30);
    expect(st.tier).toBe(1); // 10 erreicht, 50 noch nicht
    expect(st.next).toBe(50);
    expect(st.progress).toBeCloseTo((30 - 10) / (50 - 10), 5);
  });
  it("streaks, roles and rank series", () => {
    const items = [M({ won: false }), M(), M(), M(), M({ role: "support" }), M({ won: false, role: "tank" })];
    const by = Object.fromEntries(evaluate(items, OV).map((s) => [s.series.key, s]));
    expect(by.winstreak.value).toBe(4);
    expect(by.roles.value).toBe(3);
    expect(by.supportwins.value).toBe(1);
    expect(by.peak.value).toBe(6); // Peak-Badge 63 -> Stufe 6
    expect(by.promos.value).toBe(1);
  });
  it("summary: points, level and next-up", () => {
    const items = Array.from({ length: 60 }, (_, i) => M({ grade: i % 4 === 0 ? "S" : "B" }));
    const sum = summarize(evaluate(items, OV));
    expect(sum.points).toBeGreaterThan(0);
    expect(sum.level).toBeGreaterThanOrEqual(1);
    expect(sum.unlocked).toBeGreaterThan(3);
    expect(sum.nextUp.length).toBeGreaterThan(0);
    expect(sum.total).toBeGreaterThanOrEqual(80);
  });
});
