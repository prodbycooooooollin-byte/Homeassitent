import { describe, expect, it } from "vitest";
import { advantageSummary, awards, feed, laneReports, objectiveLabel, teamAdvantage, valueAt } from "./insights";
import { normalizeMetadata } from "./api/normalize";
import type { MatchDetails, MatchPlayer } from "./types";

const tl = (nw: number[]) => ({ t: [0, 240, 480, 960], nw, k: [0, 1, 2, 5], d: [0, 0, 1, 2], a: [0, 0, 0, 1], dmg: nw, heal: [0, 0, 0, 0], taken: [0, 0, 0, 0] });
const P = (id: number, team: 0 | 1, lane: number, nw: number[], over: Partial<MatchPlayer> = {}): MatchPlayer => ({
  accountId: id, team, heroId: 1, kills: 5, deaths: 2, assists: 1, level: 20, netWorth: nw[3], lastHits: 0, denies: 0, heroDamage: nw[3], objectiveDamage: 0,
  healing: 0, damageTaken: 0, badge: 50, abandoned: false, slot: id, lane, timeline: tl(nw), ...over,
});
const D: MatchDetails = {
  matchId: 1, startTime: 0, durationS: 960, winningTeam: 1, avgBadge: [50, 50],
  players: [P(1, 0, 1, [0, 1000, 3000, 9000]), P(2, 1, 1, [0, 1500, 4200, 15000]), P(3, 0, 4, [0, 900, 2500, 8000]), P(4, 1, 4, [0, 900, 2400, 7000])],
  objectives: [{ id: 6, team: 0, t: 700 }], midBoss: [{ team: 1, t: 800 }],
};

describe("insights", () => {
  it("interpolates timelines", () => {
    expect(valueAt(D.players[0].timeline as never, "nw", 120)).toBe(500);
    expect(valueAt(D.players[0].timeline as never, "nw", 5000)).toBe(9000);
  });
  it("lane report: souls at 8:00 and winner", () => {
    const r = laneReports(D);
    expect(r.map((x) => x.lane)).toEqual([1, 4]);
    expect(r[0].sides[0].souls).toBe(3000);
    expect(r[0].sides[1].souls).toBe(4200);
    expect(r[0].winner).toBe(1);
    expect(r[1].winner).toBeNull(); // 100 Souls Unterschied = ausgeglichen
  });
  it("team advantage and comeback detection", () => {
    const adv = teamAdvantage(D);
    expect(adv[0].diff).toBe(0);
    expect(adv[adv.length - 1].diff).toBeLessThan(0);
    expect(advantageSummary(D, 1)?.max.diff).toBeGreaterThan(0);
  });
  it("feed merges kills, objectives and boss in time order", () => {
    const withDeaths = { ...D, players: D.players.map((p, i) => (i === 0 ? { ...p, deathLog: [{ t: 100, killerSlot: 2 }] } : p)) };
    const f = feed(withDeaths);
    expect(f.map((e) => e.kind)).toEqual(["kill", "objective", "boss"]);
    expect(f[0].kind === "kill" && f[0].killer?.accountId).toBe(2);
    expect(objectiveLabel(6)).toBe("Walker (Lane 2)");
  });
  it("awards include an MVP and best souls", () => {
    const a = awards(D);
    expect(a[0].key).toBe("mvp");
    expect(a.find((x) => x.key === "souls")?.player.accountId).toBe(2);
  });
});

describe("metadata -> timeline/items/objectives", () => {
  it("reads lane, deaths, items, objectives, mid boss", () => {
    const raw = { match_info: { match_id: 9, duration_s: 900, winning_team: 0, match_outcome: 0, objectives: [{ team_objective_id: 1, team: 1, destroyed_time_s: 420 }, { team_objective_id: 2, team: 1, destroyed_time_s: 0 }],
      mid_boss: [{ team_killed: 0, team_claimed: 1, destroyed_time_s: 600 }],
      players: [{ account_id: 1, player_slot: 3, team: 0, assigned_lane: 4, hero_id: 2, mvp_rank: 1,
        death_details: [{ game_time_s: 200, killer_player_slot: 8, death_duration_s: 20 }, { game_time_s: 500, killer_player_slot: 8, death_duration_s: 30 }],
        items: [{ item_id: 77, game_time_s: 60 }, { item_id: 0, game_time_s: 70 }, { item_id: 78, game_time_s: 200, sold_time_s: 700 }],
        stats: [{ time_stamp_s: 0 }, { time_stamp_s: 60, net_worth: 500, kills: 0 }, { time_stamp_s: 120, net_worth: 1200, kills: 1, player_damage: 300 }] }] } };
    const d = normalizeMetadata(raw)!;
    const p = d.players[0];
    expect(p.lane).toBe(4); expect(p.slot).toBe(3); expect(p.mvpRank).toBe(1);
    expect(p.deadTimeS).toBe(50);
    expect(p.items).toEqual([{ id: 77, t: 60, sold: undefined }, { id: 78, t: 200, sold: 700 }]);
    expect(p.timeline?.nw).toEqual([0, 500, 1200]);
    expect(d.objectives).toEqual([{ id: 1, team: 1, t: 420 }]);
    expect(d.midBoss).toEqual([{ team: 1, t: 600 }]);
  });
});

import { turningPoint } from "./insights";
import { demoMatch as dm } from "./fixtures";
describe("turningPoint", () => {
  it("liefert ein Fenster mit Verschiebung", () => {
    let found = false;
    for (let i = 0; i < 10; i++) { const d = dm(70000000 + i, 1); const me = d.players[0]; const tp = turningPoint(d, me); if (tp) { found = true; expect(tp.to - tp.from).toBe(180); } }
    expect(found).toBe(true);
  });
});
