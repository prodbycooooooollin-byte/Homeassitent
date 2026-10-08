import { describe, expect, it } from "vitest";
import { analyze, goalProgress, normalizedCurve } from "./training";
import { demoMatch } from "./fixtures";
import { ratePlayer } from "./rating";

const build = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const details = demoMatch(70000000 + i, 1);
    const me = details.players.find((p) => p.accountId === 1) ?? details.players[0];
    const scores = new Map<number, number>();
    for (const p of details.players) { const r = ratePlayer(details, p.accountId); if (r) scores.set(p.accountId, r.score); }
    return { details, me, scores, won: details.winningTeam === me.team };
  });

describe("training", () => {
  it("builds normalized curves of 11 points", () => {
    const m = build(1)[0];
    const c = normalizedCurve(m.me, m.details.durationS, "nw")!;
    expect(c).toHaveLength(11);
    expect(c[10]).toBeGreaterThan(c[2]);
  });
  it("analyzes matches and yields focus + metrics", () => {
    const ms = build(8);
    const r = analyze(ms, null);
    expect(r.matches).toBeGreaterThan(0);
    expect(r.curves[0].mine).toHaveLength(11);
    expect(r.curves[0].top).not.toBeNull();
    expect(r.focus.length).toBeGreaterThan(0);
    expect(r.metrics.find((m) => m.id === "deaths")!.values).toHaveLength(8);
  });
  it("asks for more data when few matches", () => {
    expect(analyze(build(1), null).focus[0].id).toBe("data");
  });
  it("tracks goal progress", () => {
    const r = analyze(build(8), null);
    const g = { id: "x", metric: "deaths", lowerIsBetter: true, target: 99, needed: 3, window: 5, createdAt: 0 };
    const p = goalProgress(g, r.metrics);
    expect(p.hits).toBe(5);
    expect(p.done).toBe(true);
  });
});

describe("Mustererkennung", () => {
  it("findet Soul-Lücke und liefert Belege und Maßnahmen", () => {
    const r = analyze(build(12), null);
    expect(r.soulPlan).not.toBeNull();
    const souls = r.focus.find((f) => f.id === "souls");
    expect(souls).toBeDefined();
    expect(souls!.evidence.length).toBeGreaterThan(1);
    expect(souls!.fix.length).toBeGreaterThan(1);
    expect(souls!.title).toContain("Neutrale");
  });
});

import { buildView } from "./training-view";
describe("Training-Ansicht", () => {
  it("liefert Scorecard, Hauptproblem und letztes Match", () => {
    const ms = build(14);
    const rep = analyze(ms, null);
    const v = buildView(ms, rep);
    expect(v.skills).toHaveLength(8);
    expect(v.skills.some((s) => s.pct !== null)).toBe(true);
    expect(v.problem).not.toBeNull();
    expect(v.problem!.action.length).toBeGreaterThan(10);
    expect(v.last!.lines.length).toBeGreaterThan(0);
  });
  it("neue Metriken liefern Werte", () => {
    const r = analyze(build(6), null);
    for (const id of ["soloDeaths", "camps", "creepPct", "deadShare"]) expect(r.metrics.find((m) => m.id === id)!.values.some((x) => x.value !== null)).toBe(true);
  });
});

import { classifyDeaths, reasonsFor } from "./training-reasons";
describe("Spielerspezifische Gründe", () => {
  it("ordnet jedem Tod genau eine Ursache zu", () => {
    const ms = build(10);
    const deaths = classifyDeaths(ms);
    expect(deaths.length).toBe(ms.reduce((a, m) => a + (m.me.deathLog?.length ?? 0), 0));
  });
  it("liefert konkrete Gründe mit Zahlen", () => {
    const r = reasonsFor("survival", build(14));
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].text).toMatch(/\d/);
  });
});
