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
});
