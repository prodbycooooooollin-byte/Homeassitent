import { describe, expect, it } from "vitest";
import { rankCounters, reasonFor, scoreHero, winrateVs, ownWeight, type EnemyMatchups } from "./counter";

// Gegner 10 gewinnt 40 % gegen Held 1 und 60 % gegen Held 2.
const mm: EnemyMatchups = {
  10: [{ heroId: 1, matches: 1000, wins: 400 }, { heroId: 2, matches: 1000, wins: 600 }, { heroId: 3, matches: 10, wins: 0 }],
  11: [{ heroId: 1, matches: 1000, wins: 450 }, { heroId: 2, matches: 1000, wins: 550 }],
};

describe("counter", () => {
  it("kehrt die Perspektive des Gegners um und ignoriert kleine Stichproben", () => {
    expect(winrateVs(1, 10, mm)!.wr).toBeGreaterThan(0.59);
    expect(winrateVs(2, 10, mm)!.wr).toBeLessThan(0.41);
    expect(winrateVs(3, 10, mm)).toBeNull();
    expect(winrateVs(9, 10, mm)).toBeNull();
  });
  it("Gewicht der eigenen Erfahrung ist begrenzt", () => {
    expect(ownWeight(0)).toBe(0);
    expect(ownWeight(100)).toBeCloseTo(0.4);
  });
  it("ohne Daten Score 50", () => {
    const p = scoreHero(99, [10], mm);
    expect(p.score).toBe(50);
    expect(p.matchup).toBeNull();
    expect(p.isNew).toBe(true);
  });
  it("rankt gutes Matchup vorn und listet schlechte zum Meiden", () => {
    const r = rankCounters([1, 2, 10], [10, 11], mm, []);
    expect(r.picks.map((p) => p.heroId)).toEqual([1, 2]);
    expect(r.picks[0].score).toBeGreaterThan(r.picks[1].score);
    expect(r.avoid[0].heroId).toBe(2);
  });
  it("eigene Winrate kann ein ähnliches Matchup übertrumpfen", () => {
    const m: EnemyMatchups = { 10: [{ heroId: 1, matches: 1000, wins: 480 }, { heroId: 2, matches: 1000, wins: 480 }] };
    const r = rankCounters([1, 2], [10], m, [{ heroId: 2, matches: 30, wins: 24 }, { heroId: 1, matches: 30, wins: 10 }]);
    expect(r.picks[0].heroId).toBe(2);
    expect(r.picks[0].isNew).toBe(false);
  });
  it("Begründung nennt Gegner und Spiele", () => {
    const p = scoreHero(1, [10, 11], mm, { heroId: 1, matches: 12, wins: 7 });
    const txt = reasonFor(p, (id) => `H${id}`);
    expect(txt).toContain("gewinnt");
    expect(txt).toContain("H10 und H11");
    expect(txt).toContain("12 Spiele");
  });
});
