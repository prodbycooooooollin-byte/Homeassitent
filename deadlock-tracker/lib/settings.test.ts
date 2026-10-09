import { describe, expect, it } from "vitest";
import { sanitize } from "./settings";

describe("settings", () => {
  it("clamps and validates values", () => {
    const s = sanitize({ pollIntervalS: 3, effects: "weird" as never, density: "compact", backfill: false });
    expect(s.pollIntervalS).toBe(10);
    expect(s.effects).toBe("full");
    expect(s.density).toBe("compact");
    expect(s.backfill).toBe(false);
    expect(sanitize({ pollIntervalS: 9999 }).pollIntervalS).toBe(300);
    expect(sanitize({}).notifyNewMatch).toBe(true);
  });
  it("sanitizes the profile", () => {
    expect(sanitize({}).profile).toEqual({ title: "", mainHero: null, stats: ["winrate", "kda", "score", "matches"], badges: [], accent: "auto" });
    const p = sanitize({ profile: { title: "  Ein sehr langer Titel der abgeschnitten wird  ", mainHero: 7, stats: ["kda", "kda", "evil", "winrate", "spm", "deaths", "peak"], badges: ["wins", "x", "kills", "s", "night"], accent: "#FF8559" } }).profile;
    expect(p.title.length).toBeLessThanOrEqual(24);
    expect(p.mainHero).toBe(7);
    expect(p.stats).toEqual(["kda", "winrate", "spm", "deaths"]);
    expect(p.badges).toEqual(["wins", "kills", "s"]);
    expect(p.accent).toBe("#ff8559");
    const bad = sanitize({ profile: { title: "<b>x</b>", mainHero: -3, stats: "no", badges: 5, accent: "red" } as never }).profile;
    expect(bad).toMatchObject({ title: "bx/b", mainHero: null, accent: "auto" });
    expect(bad.stats).toEqual(["winrate", "kda", "score", "matches"]);
  });
});
