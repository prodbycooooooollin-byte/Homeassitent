import { describe, expect, it } from "vitest";
import { bestTimes, compareWindows, movingAverage, perWeek } from "./performance";
import type { MatchListItem } from "./view";

const mk = (i: number, won: boolean, score: number): MatchListItem => ({ matchId: i, startTime: 1_700_000_000 - i * 3600, durationS: 1800, heroId: 1, won, kills: 5, deaths: 4, assists: 6, netWorth: 30000, grade: "B", score, lobbyBadge: null, detailsReady: true, detectedAfterS: null, myBadge: null, parts: null, rankedDelta: null, team: 0, level: 20, role: null });

describe("Leistung", () => {
  it("vergleicht die letzten 10 mit den 10 davor", () => {
    const items = [...Array.from({ length: 10 }, (_, i) => mk(i, true, 1.2)), ...Array.from({ length: 10 }, (_, i) => mk(10 + i, i < 3, 0.9))];
    const c = compareWindows(items);
    expect(c.now.wr).toBe(1);
    expect(c.before.wr).toBeCloseTo(0.3);
    expect(c.now.score! - c.before.score!).toBeCloseTo(0.3);
  });
  it("glättet", () => { expect(movingAverage([1, 3, 5], 3)).toEqual([2, 3, 4]); });
  it("findet beste Zeit und Matches pro Woche", () => {
    const items = Array.from({ length: 12 }, (_, i) => mk(i, i % 2 === 0, 1));
    expect(bestTimes(items).hour === null || bestTimes(items).hour!.n >= 5).toBe(true);
    expect(perWeek(items, 1_700_000_000_000)).toBeGreaterThan(0);
  });
});
