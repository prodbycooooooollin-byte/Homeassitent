import { describe, expect, it } from "vitest";
import { advise, detectEvents, type CoachSnap } from "./coach";

const s = (t: number, diff: number | null, objMine: number | null = 0, objEnemy: number | null = 0): CoachSnap => ({ t, diff, objMine, objEnemy });

describe("Live-Coach", () => {
  it("empfiehlt früh Lane-Arbeit", () => {
    expect(advise([s(60, 0)]).main.id).toBe("start");
    expect(advise([s(300, 0)]).main.id).toBe("lane");
  });
  it("erkennt Vorsprung und Rückstand", () => {
    expect(advise([s(1000, 6000)]).main.id).toBe("lead");
    expect(advise([s(1000, -6000)]).main.id).toBe("behind");
  });
  it("erkennt schmelzenden Vorsprung", () => {
    const h = [s(700, 7500), s(800, 6500), s(900, 5000), s(1000, 4500)];
    expect(advise(h).main.id).toBe("melting");
  });
  it("meldet Ereignisse", () => {
    const ev = detectEvents(s(600, 500, 0, 0), s(620, -800, 1, 1));
    expect(ev.map((e) => e.id).sort()).toEqual(["lead-20", "oe1", "om1"].sort());
  });
});
