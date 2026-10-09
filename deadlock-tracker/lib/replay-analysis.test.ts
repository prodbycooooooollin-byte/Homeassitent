import { describe, expect, it } from "vitest";
import { analyzeReplay } from "./replay-analysis";
import type { ReplayData } from "./replay-types";

/** Synthetisches Replay: 6 gegen 6, Spieler 0 (du, Team 0). Teams starten an den Basen und laufen zur Mitte. */
function build(opts: { meX: number; deathT: number; enemyNearMe: number; kills?: ReplayData["kills"] }): ReplayData {
  const step = 0.5, n = 400; // 200 s
  const players = Array.from({ length: 12 }, (_, i) => ({ accountId: 100 + i, team: (i < 6 ? 0 : 1) as 0 | 1, heroId: 1 + i }));
  const x: number[][] = [], y: number[][] = [], hp: number[][] = [], maxHp: number[][] = [], alive: number[][] = [];
  players.forEach((p, pi) => {
    const xs: number[] = [], ys: number[] = [], hs: number[] = [], ms: number[] = [], as: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = i * step;
      const base = p.team === 0 ? -9000 : 9000;
      const mid = p.team === 0 ? -3500 : 3500;
      const f = Math.min(1, t / 40);
      let px = base + (mid - base) * f, py = (pi % 6) * 300;
      if (pi === 0) px = base + (opts.meX - base) * f;
      if (pi === 6) px = opts.enemyNearMe;
      let h = 1000;
      let alive1 = 1;
      if (pi === 0 && t >= opts.deathT - 4 && t < opts.deathT) h = 1000 * (1 - (t - (opts.deathT - 4)) / 4);
      if (pi === 0 && t >= opts.deathT) { alive1 = 0; h = 0; }
      xs.push(Math.round(px)); ys.push(Math.round(py)); hs.push(Math.round(h)); ms.push(1000); as.push(alive1);
    }
    x.push(xs); y.push(ys); hp.push(hs); maxHp.push(ms); alive.push(as);
  });
  return { version: 1, matchId: 1, step, tStart: 0, tickRate: 64, players, x, y, hp, maxHp, alive, kills: opts.kills ?? [{ t: opts.deathT, victim: 0, attacker: 6, assisters: [7, 8], x: opts.meX, y: 0 }] };
}
const opt = { heroName: (id: number) => `Held${id}` };

describe("Szenen-Analyse", () => {
  it("erkennt zu weites Vorlaufen mit Zahlen aus der Szene", () => {
    const d = build({ meX: -500, deathT: 100, enemyNearMe: 0 });
    const r = analyzeReplay(d, null, 100, opt);
    const s = r.scenes.find((x) => x.kind === "death")!;
    expect(s).toBeTruthy();
    expect(s.cause).toBe("overextended");
    expect(s.why).toMatch(/\d+ m vor deinem Team/);
    expect(s.headline).toContain("Held7");
    expect(s.facts.some((f) => f.key === "ally" && f.tone === "bad")).toBe(true);
  });

  it("zwei verschiedene Szenen liefern unterschiedliche Texte", () => {
    const a = analyzeReplay(build({ meX: -500, deathT: 100, enemyNearMe: 0 }), null, 100, opt).scenes[0];
    const b = analyzeReplay(build({ meX: -3300, deathT: 120, enemyNearMe: -3000 }), null, 100, opt).scenes[0];
    expect(a.why).not.toBe(b.why);
    expect(a.cause).not.toBe(b.cause);
  });

  it("bewertet einen Kill auf einen isolierten Gegner als Pick", () => {
    const d = build({ meX: -3300, deathT: 190, enemyNearMe: -2800, kills: [{ t: 100, victim: 6, attacker: 0, assisters: [], x: -2800, y: 0 }] });
    // Gegner 6 steht weit weg von seinem Team (Rest bei +3500)
    const r = analyzeReplay(d, null, 100, opt);
    const s = r.scenes.find((x) => x.kind === "kill")!;
    expect(s.cause).toBe("pick");
    expect(s.why).toMatch(/getrennt/);
  });

  it("liefert ohne den Spieler keine Szenen", () => {
    const r = analyzeReplay(build({ meX: -500, deathT: 100, enemyNearMe: 0 }), null, 999, opt);
    expect(r.scenes).toEqual([]);
  });
});
