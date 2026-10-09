import { describe, expect, it } from "vitest";
import { demoMatch } from "./fixtures";
import { analyzeBasic } from "./replay-basic";

describe("Szenen-Analyse ohne Replay", () => {
  const d = demoMatch(70000000, 1);
  const r = analyzeBasic(d, 1, (id) => `Held${id}`);
  it("liefert Szenen für Tode, Kills und Assists mit Fakten", () => {
    expect(r.scenes.length).toBeGreaterThan(5);
    for (const s of r.scenes) { expect(s.basic).toBe(true); expect(s.facts.length).toBeGreaterThan(1); expect(s.why.length).toBeGreaterThan(20); }
    expect(r.scenes.some((s) => s.kind === "death")).toBe(true);
    expect(r.scenes.some((s) => s.kind === "kill")).toBe(true);
  });
  it("zählt Todesursachen und bleibt ohne den Spieler leer", () => {
    expect(Object.values(r.causes).reduce((a, b) => a + b, 0)).toBe(r.scenes.filter((s) => s.kind === "death").length);
    expect(analyzeBasic(d, 999, (id) => `Held${id}`).scenes).toEqual([]);
  });
});
