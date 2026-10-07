import { describe, expect, it } from "vitest";
import { gradeFor, ratePlayer } from "./rating";
import { averageBadge, formatBadge } from "./ranks";
import type { MatchDetails, MatchPlayer } from "./types";

function player(id: number, team: 0 | 1, over: Partial<MatchPlayer> = {}): MatchPlayer {
  return {
    accountId: id, team, heroId: 1, kills: 5, deaths: 5, assists: 5, level: 20,
    netWorth: 30000, lastHits: 150, denies: 5, heroDamage: 25000, objectiveDamage: 3000,
    healing: 0, damageTaken: 20000, badge: 63, abandoned: false, ...over,
  };
}
function match(me: Partial<MatchPlayer>, winner: 0 | 1 = 0): MatchDetails {
  const players = Array.from({ length: 12 }, (_, i) => player(i + 1, i < 6 ? 0 : 1));
  players[0] = player(1, 0, me);
  return { matchId: 1, startTime: 0, durationS: 1800, winningTeam: winner, avgBadge: [63, 63], players };
}

describe("rating", () => {
  it("grades thresholds", () => {
    expect(gradeFor(1.6)).toBe("S");
    expect(gradeFor(1.2)).toBe("A");
    expect(gradeFor(1.0)).toBe("B");
    expect(gradeFor(0.8)).toBe("C");
    expect(gradeFor(0.6)).toBe("D");
    expect(gradeFor(0.1)).toBe("F");
  });
  it("dominant player gets S, feeder gets F/D", () => {
    const top = ratePlayer(match({ kills: 20, deaths: 1, assists: 12, netWorth: 60000, heroDamage: 70000, objectiveDamage: 12000 }), 1)!;
    const bad = ratePlayer(match({ kills: 0, deaths: 14, assists: 1, netWorth: 12000, heroDamage: 6000, objectiveDamage: 0 }, 1), 1)!;
    expect(top.grade).toBe("S");
    expect(["D", "F"]).toContain(bad.grade);
    expect(top.score).toBeGreaterThan(bad.score);
  });
  it("healer is not punished for low damage", () => {
    const healer = ratePlayer(match({ heroDamage: 5000, healing: 40000 }), 1)!;
    const noHeal = ratePlayer(match({ heroDamage: 5000, healing: 0 }), 1)!;
    expect(healer.score).toBeGreaterThan(noHeal.score);
  });
  it("abandoner gets F; unknown player gets null", () => {
    expect(ratePlayer(match({ abandoned: true, kills: 20 }), 1)!.grade).toBe("F");
    expect(ratePlayer(match({}), 999)).toBeNull();
  });
});

describe("ranks", () => {
  it("averages badges linearly", () => {
    expect(averageBadge([61, 65])).toBe(63);
    expect(averageBadge([null, undefined])).toBeNull();
    expect(formatBadge(63)).toBe("Emissary 3");
  });
});
