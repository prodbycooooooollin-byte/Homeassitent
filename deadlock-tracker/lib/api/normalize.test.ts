import { describe, expect, it } from "vitest";
import { normalizeHistory, normalizeMetadata } from "./normalize";
import { normalizeHeroes, normalizeRanks } from "../assets";

// Formate laut OpenAPI-Spec (PlayerMatchHistoryEntry) und Valve-Proto (CMsgMatchMetaDataContents)
describe("match history", () => {
  const raw = [
    { account_id: 7, match_id: 100, hero_id: 6, hero_level: 22, start_time: 1000, match_duration_s: 1800, match_mode: 4, game_mode: 1,
      match_result: 1, player_team: 0, player_match_outcome: 2, player_kills: 5, player_deaths: 6, player_assists: 7, net_worth: 30000,
      last_hits: 100, denies: 3, abandoned_time_s: null, ranked_display_badge: 63, ranked_delta: -12 },
    { account_id: 7, match_id: 101, hero_id: 2, start_time: 3000, match_duration_s: 1200, match_mode: 1, game_mode: 1, match_result: 0, player_team: 0,
      player_match_outcome: 1, player_kills: 1, player_deaths: 1, player_assists: 1, net_worth: 1, last_hits: 1, denies: 0, hero_level: 5, abandoned_time_s: 300 },
  ];
  it("uses player_match_outcome, mode labels and the ranked badge", () => {
    const [a, b] = normalizeHistory(raw, 7);
    expect(a.won).toBe(false);
    expect(a.matchMode).toBe("Ranked");
    expect(a.badge).toBe(63);
    expect(b.won).toBe(true);
    expect(b.matchMode).toBe("Unranked");
    expect(b.badge).toBeNull();
    expect(b.abandoned).toBe(true);
  });
  it("falls back to match_result (= winning team) without outcome", () => {
    const [e] = normalizeHistory([{ match_id: 1, player_team: 1, match_result: 1 }], 7);
    expect(e.won).toBe(true);
  });
});

describe("match metadata", () => {
  const player = (id: number, team: number, extra = {}) => ({
    account_id: id, team, hero_id: 6, kills: 3, deaths: 2, assists: 1, net_worth: 20000, level: 20, last_hits: 90, denies: 4,
    player_rank_data: { initial_display_rank: 62 },
    stats: [{ time_stamp_s: 60, kills: 0, player_damage: 10 }, { time_stamp_s: 1800, kills: 3, deaths: 2, assists: 1, net_worth: 20000, player_damage: 15000, boss_damage: 2000, player_healing: 500, self_healing: 100, player_damage_taken: 9000 }],
    ...extra,
  });
  const raw = { match_info: { match_id: 55, duration_s: 1800, start_time: 1234, winning_team: 1, match_outcome: 0, match_mode: 4, game_mode: 1,
    average_badge_team0: 61, average_badge_team1: 65, players: [player(1, 0), player(2, 1, { abandon_match_time_s: 200 })] } };

  it("reads final stats, rank data, outcome and modes", () => {
    const d = normalizeMetadata(raw)!;
    expect(d.winningTeam).toBe(1);
    expect(d.matchMode).toBe("Ranked");
    expect(d.avgBadge).toEqual([61, 65]);
    const p = d.players[0];
    expect(p.badge).toBe(62);
    expect(p.heroDamage).toBe(15000);
    expect(p.objectiveDamage).toBe(2000);
    expect(p.healing).toBe(600);
    expect(p.damageTaken).toBe(9000);
    expect(d.players[1].abandoned).toBe(true);
  });
  it("draw / error outcome has no winner; missing team averages come from player ranks", () => {
    const r = JSON.parse(JSON.stringify(raw));
    r.match_info.match_outcome = 2;
    delete r.match_info.average_badge_team0;
    const d = normalizeMetadata(r)!;
    expect(d.winningTeam).toBeNull();
    expect(d.avgBadge[0]).toBe(62);
  });
  it("garbage does not throw", () => {
    expect(normalizeMetadata(null)).toBeNull();
    expect(normalizeMetadata({ match_info: { match_id: 1, players: [] } })).toBeNull();
  });
});

describe("assets (api.deadlock-api.com/v1/assets)", () => {
  it("maps hero images and colors", () => {
    const h = normalizeHeroes([{ id: 6, name: "Abrams", colors: { ui: [200, 120, 40], style_hex: null },
      images: { icon_hero_card: "https://assets-bucket.deadlock-api.com/a.png", icon_image_small: "https://x.deadlock-api.com/s.png", background_image: "https://x.deadlock-api.com/bg.png" } }]);
    expect(h[6].name).toBe("Abrams");
    expect(h[6].color).toBe("#c87828");
    expect(h[6].portrait).toContain("/api/img?u=");
    expect(h[6].art).toContain("bg.png");
  });
  it("maps rank subrank images", () => {
    const r = normalizeRanks([{ tier: 7, name: "Archon", color: "#aabbcc", images: { small: "https://a/s.png", subrank3: "https://a/3.png", large_subrank3: "https://a/l3.png" } }]);
    expect(r[7].sub[3].badge).toContain("3.png");
    expect(r[7].sub[3].large).toContain("l3.png");
    expect(r[7].name).toBe("Archon");
  });
});

import { upgradeAvatar } from "./deadlock-api";
describe("steam avatars", () => {
  it("always uses the 184px variant", () => {
    const h = "a".repeat(40);
    expect(upgradeAvatar(`https://avatars.steamstatic.com/${h}.jpg`)).toBe(`https://avatars.steamstatic.com/${h}_full.jpg`);
    expect(upgradeAvatar(`https://avatars.steamstatic.com/${h}_medium.jpg`)).toBe(`https://avatars.steamstatic.com/${h}_full.jpg`);
    expect(upgradeAvatar(`https://x.example/pic.png`)).toBe("https://x.example/pic.png");
  });
});

describe("aim stats", () => {
  it("reads shots and crits from the final stats", () => {
    const d = normalizeMetadata({ match_info: { match_id: 3, duration_s: 600, match_outcome: 0, winning_team: 0, players: [
      { account_id: 1, team: 0, hero_id: 1, stats: [{ time_stamp_s: 0 }, { time_stamp_s: 600, shots_hit: 120, shots_missed: 180, hero_bullets_hit: 70, hero_bullets_hit_crit: 14 }] },
      { account_id: 2, team: 1, hero_id: 2, stats: [{ time_stamp_s: 0 }, { time_stamp_s: 600 }] }] } })!;
    expect(d.players[0]).toMatchObject({ shotsHit: 120, shotsMissed: 180, heroHits: 70, heroCrits: 14 });
    expect(d.players[1].shotsHit).toBeUndefined(); // keine erfundenen Nullen
  });
});
