import { describe, expect, it } from "vitest";
import { computeStat, ensureVivid, luminance, resolveAccent, titleSuggestions, unlockedBadges, STAT_KEYS } from "./profile-customize";
import { overview, type MatchListItem } from "./view";

let id = 0;
const M = (o: Partial<MatchListItem> = {}): MatchListItem => ({
  matchId: ++id, startTime: 1_000_000 + id * 100, durationS: 1800, heroId: 1, won: true, kills: 5, deaths: 3, assists: 4, netWorth: 30000, grade: "B", score: 1.0,
  lobbyBadge: 63, detailsReady: true, detectedAfterS: null, myBadge: 63, parts: [1, 1, 1, 1, 1, 1, 1], rankedDelta: null, team: 0, level: 20, role: null, ...o,
});
const many = (n: number, o: Partial<MatchListItem> = {}) => Array.from({ length: n }, () => M(o));

describe("profile stats", () => {
  it("computes values", () => {
    const items = [M({ won: true, deaths: 2 }), M({ won: true, deaths: 4 }), M({ won: false, deaths: 6, durationS: 2400 })];
    const ov = overview(items);
    expect(computeStat("winrate", items, ov)?.value).toBe("67%");
    expect(computeStat("deaths", items, ov)?.value).toBe("4.0");
    expect(computeStat("streakNow", items, ov)?.value).toBe("2");
    expect(computeStat("streakBest", items, ov)?.value).toBe("2");
    expect(computeStat("duration", items, ov)?.value).toBe("33 Min");
    expect(computeStat("spm", items, ov)?.value).toBe("900");
    expect(computeStat("nope", items, ov)).toBeNull();
    expect(STAT_KEYS).toHaveLength(11);
  });
  it("handles empty data", () => {
    const ov = overview([]);
    for (const k of STAT_KEYS) expect(computeStat(k, [], ov)?.value).toBeTruthy();
  });
});

describe("title suggestions", () => {
  const earned = (items: MatchListItem[]) => titleSuggestions(items, overview(items)).filter((t) => t.earned).map((t) => t.title);
  it("tank share, deaths, souls", () => {
    expect(earned(many(10, { role: "tank" }))).toContain("Frontline-Brecher");
    expect(earned(many(10, { deaths: 10 }))).toContain("Tod-Magnet");
    expect(earned(many(10, { deaths: 2 }))).toContain("Eisenwand");
    expect(earned(many(10, { netWorth: 50000 }))).toContain("Soul-Farmer");
    expect(earned(many(10))).not.toContain("Soul-Farmer");
  });
  it("streak, lane and volume", () => {
    expect(earned(many(5, { won: true }))).toContain("Serien-Sieger");
    expect(earned(many(6, { won: false }))).not.toContain("Serien-Sieger");
    expect(earned(many(6, { parts: [1, 1, 1, 1, 1, 1, 1.3] }))).toContain("Lane-Dominator");
    expect(earned(many(100))).toContain("Unermüdlich");
    expect(earned([M()])).toEqual([]);
  });
});

describe("badges and colors", () => {
  it("lists unlocked achievements, highest tier first", () => {
    const items = many(60);
    const b = unlockedBadges(items, overview(items));
    expect(b.length).toBeGreaterThan(0);
    for (let i = 1; i < b.length; i++) expect(b[i - 1].tier).toBeGreaterThanOrEqual(b[i].tier);
  });
  it("lifts dark colors", () => {
    for (const c of ["#1a1f3a", "#2b2b6e", "#3a0f1a", "#202020"]) {
      const v = ensureVivid(c);
      expect(luminance(v)).toBeGreaterThanOrEqual(0.2);
    }
    expect(ensureVivid("#202020")).toBe("#8b6cff");
    expect(ensureVivid("#3ecf8e")).toBe("#3ecf8e");
    expect(ensureVivid("kaputt")).toBe("#8b6cff");
  });
  it("resolves accent choices", () => {
    expect(resolveAccent("#ff8559", { heroColor: "#111111" })).toBe("#ff8559");
    expect(resolveAccent("rank", { heroColor: "#3ecf8e", rankColor: "#a77be8" })).toBe(ensureVivid("#a77be8"));
    expect(luminance(resolveAccent("auto", { heroColor: "#1a1f3a" }))).toBeGreaterThanOrEqual(0.3);
  });
});
