import { describe, expect, it } from "vitest";
import { breakEven, buildModel, drift, simulate, type HistPoint } from "./forecast";

const hist = (n: number): HistPoint[] => Array.from({ length: n }, (_, i) => ({ t: i, badge: 63, delta: i % 2 ? 22 : -18, won: i % 2 === 1 }));

describe("Rang-Prognose", () => {
  it("baut ein Modell aus Rang-Punkten", () => {
    const m = buildModel(hist(20))!;
    expect(m.avgWin).toBe(22);
    expect(m.avgLoss).toBe(18);
    expect(breakEven(m)).toBeCloseTo(0.45, 2);
    expect(drift(m, 0.6)).toBeGreaterThan(0);
    expect(buildModel([{ t: 0, badge: 63, delta: null, won: true }])).toBeNull();
  });
  it("höhere Siegquote führt zu höherem Median und mehr Aufstiegen", () => {
    const m = buildModel(hist(20))!;
    const a = simulate(m, 0.45, 60), b = simulate(m, 0.65, 60);
    expect(b.endMedian).toBeGreaterThan(a.endMedian);
    expect(b.pUp).toBeGreaterThan(a.pUp);
  });
  it("ist deterministisch", () => {
    const m = buildModel(hist(20))!;
    expect(simulate(m, 0.55, 30).endMedian).toBe(simulate(m, 0.55, 30).endMedian);
  });
});
