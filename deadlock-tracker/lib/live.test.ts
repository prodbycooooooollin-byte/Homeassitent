import { describe, expect, it } from "vitest";
import { analyzePlayer, lobbyBaseline, rates, scoutInsights, summarizeTeam, winChance, type PlayerFacts } from "./live";
import type { HistoryEntry } from "./types";

let t = 1_000_000;
const H = (o: Partial<HistoryEntry> = {}): HistoryEntry => ({
  matchId: ++t, accountId: 1, heroId: 7, startTime: 2_000_000 - t, durationS: 1800, won: true, team: 0, kills: 6, deaths: 5, assists: 8, netWorth: 30000,
  lastHits: 100, denies: 3, heroLevel: 20, abandoned: false, ...o,
});
const many = (n: number, o: Partial<HistoryEntry> = {}) => Array.from({ length: n }, () => H(o));
const facts = (history: HistoryEntry[] | null, o: Partial<PlayerFacts> = {}): PlayerFacts => ({ accountId: 1, heroId: 7, team: 0, badge: 63, history, ...o });
const base = { kpm: 0.2, dpm: 0.17, apm: 0.27 };
const keys = (p: ReturnType<typeof analyzePlayer>) => p.tags.map((x) => x.key);

describe("scouting tags", () => {
  it("first ever match and newbie", () => {
    expect(keys(analyzePlayer(facts([]), base, "Held"))).toContain("firstever");
    expect(keys(analyzePlayer(facts(many(5)), base, "Held"))).toContain("newbie");
  });
  it("first time on this hero vs main", () => {
    expect(keys(analyzePlayer(facts(many(30, { heroId: 3 })), base, "Held"))).toContain("firsthero");
    const main = analyzePlayer(facts([...many(30, { heroId: 7 }), ...many(10, { heroId: 3 })]), base, "Held");
    expect(keys(main)).toContain("main");
    expect(main.heroGames).toBe(30);
  });
  it("aggressive vs careful relative to the lobby", () => {
    const aggressive = analyzePlayer(facts(many(20, { kills: 14, deaths: 9, assists: 5 })), base, "Held");
    expect(keys(aggressive)).toContain("aggressive");
    const careful = analyzePlayer(facts(many(20, { kills: 3, deaths: 2, assists: 6 })), base, "Held");
    expect(keys(careful)).toContain("careful");
  });
  it("form, tilt and smurf suspicion", () => {
    expect(keys(analyzePlayer(facts(many(25, { won: true })), base, "Held"))).toContain("hot");
    expect(keys(analyzePlayer(facts(many(25, { won: false })), base, "Held"))).toContain("tilt");
    expect(keys(analyzePlayer(facts(many(20, { won: true })), base, "Held"))).toContain("smurf");
    expect(keys(analyzePlayer(facts(many(200, { won: true })), base, "Held"))).not.toContain("smurf");
  });
  it("missing history is reported, never invented", () => {
    const p = analyzePlayer(facts(null), base, "Held");
    expect(keys(p)).toEqual(["nodata"]);
    expect(p.games).toBeNull();
  });
  it("rates ignore very short matches; baseline averages the lobby", () => {
    expect(rates([H({ durationS: 120 })])).toBeNull();
    const b = lobbyBaseline([facts(many(10)), facts(many(10, { kills: 12 })), facts(null)]);
    expect(b.kpm).toBeGreaterThan(0.2);
  });
});

describe("team summary, win chance and insights", () => {
  const P = (team: 0 | 1, badge: number, wr: boolean[], isMe = false) => ({ ...analyzePlayer(facts(wr.map((w) => H({ won: w })), { team, badge }), base, "Held", isMe), accountId: Math.round(Math.random() * 1e6) });
  it("stronger team has the higher chance, always within 25–75%", () => {
    const strong = summarizeTeam([P(0, 75, Array(20).fill(true)), P(0, 74, Array(20).fill(true))]);
    const weak = summarizeTeam([P(1, 31, Array(20).fill(false)), P(1, 32, Array(20).fill(false))]);
    expect(winChance(strong, weak)).toBeGreaterThan(0.6);
    expect(winChance(weak, strong)).toBeLessThan(0.4);
    expect(winChance(strong, weak, 5)).toBeLessThanOrEqual(0.75);
    expect(winChance(summarizeTeam([]), summarizeTeam([]))).toBeCloseTo(0.5, 5);
  });
  it("insight sentences name enemies who are new or play aggressively", () => {
    const me = { ...analyzePlayer(facts(many(30), { team: 0 }), base, "Held", true), name: "Ich" };
    const enemy = { ...analyzePlayer(facts([], { team: 1, accountId: 9 }), base, "Held"), name: "Gegner9" };
    const lines = scoutInsights([me, enemy], () => "Held", summarizeTeam([me]), summarizeTeam([enemy]));
    expect(lines.join(" ")).toContain("zum ersten Mal überhaupt");
  });
});

import { gamePlan, threatScore } from "./live";
describe("Spielplan", () => {
  const mk = (id: number, team: 0 | 1, wr: number, badge: number, extra: Partial<import("./live").ScoutPlayer> = {}): import("./live").ScoutPlayer => ({ accountId: id, heroId: 1, team, badge, isMe: id === 1, games: 100, wr, heroGames: 10, heroWr: 0.5, kda: 2.5, kpm: null, dpm: null, apm: null, recent: [], topHeroes: [], tags: [], ...extra });
  it("stuft stärkere Spieler höher ein", () => {
    expect(threatScore(mk(2, 1, 0.65, 90))).toBeGreaterThan(threatScore(mk(3, 1, 0.4, 30)));
  });
  it("wählt Ziel, Gefahr und Schwachstelle", () => {
    const ps = [mk(1, 0, 0.5, 60), mk(2, 0, 0.3, 20), mk(3, 0, 0.55, 60), mk(4, 1, 0.7, 90), mk(5, 1, 0.3, 20), mk(6, 1, 0.5, 60)];
    const plan = gamePlan(ps, 0);
    expect(plan.threat?.accountId).toBe(4);
    expect(plan.target?.accountId).toBe(5);
    expect(plan.weak?.accountId).toBe(2);
  });
});

import { carryShare, duelPairs } from "./live";
describe("Duelle", () => {
  const mk = (id: number, team: 0 | 1, wr: number, badge: number, games: number | null = 100): import("./live").ScoutPlayer => ({ accountId: id, heroId: 1, team, badge, isMe: id === 1, games, wr: games === null ? null : wr, heroGames: 10, heroWr: 0.5, kda: 2.5, kpm: null, dpm: null, apm: null, recent: [], topHeroes: [], tags: [] });
  it("paart nach Stärke und berechnet die Differenz aus deiner Sicht", () => {
    const ps = [mk(1, 0, 0.6, 80), mk(2, 0, 0.4, 30), mk(3, 1, 0.5, 60), mk(4, 1, 0.3, 20)];
    const d = duelPairs(ps, 0);
    expect(d).toHaveLength(2);
    expect(d[0].mine?.accountId).toBe(1); expect(d[0].enemy?.accountId).toBe(3);
    expect(d[0].diff).toBe(d[0].mineT! - d[0].enemyT!);
    expect(d[0].diff!).toBeGreaterThan(0);
  });
  it("Differenz ist null ohne Daten", () => {
    const d = duelPairs([mk(1, 0, 0.5, 60), mk(3, 1, 0.5, 60, null)], 0);
    expect(d[0].diff).toBeNull();
  });
  it("carryShare liefert den stärksten Spieler und seinen Anteil", () => {
    const ps = [mk(1, 0, 0.7, 90), mk(2, 0, 0.4, 30), mk(3, 0, 0.4, 30)];
    const c = carryShare(ps, 0)!;
    expect(c.player.accountId).toBe(1);
    expect(c.share).toBeGreaterThan(1 / 3);
    expect(carryShare([mk(1, 0, 0.5, 50)], 0)).toBeNull();
  });
});
