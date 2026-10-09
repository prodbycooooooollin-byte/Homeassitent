import { describe, expect, it } from "vitest";
import { buildDebrief, rankIn } from "./debrief";
import { demoMatch } from "./fixtures";
import { ratePlayer } from "./rating";

describe("Debrief", () => {
  it("berechnet Platzierungen und Analyse", () => {
    const d = demoMatch(70000001, 1);
    const me = d.players[0];
    const r = ratePlayer(d, me.accountId);
    const db = buildDebrief(d, me, r);
    expect(db.rows).toHaveLength(7);
    for (const row of db.rows) { expect(row.team).toBeGreaterThanOrEqual(1); expect(row.team).toBeLessThanOrEqual(6); expect(row.lobby).toBeLessThanOrEqual(12); }
    expect(db.best).not.toBeNull();
    expect(db.verdict.length).toBeGreaterThan(10);
  });
  it("Gleichstände teilen den Platz", () => {
    const d = demoMatch(70000002, 1);
    const [a, b] = d.players;
    expect(rankIn([a, b], a, () => 5)).toBe(1);
  });
});
