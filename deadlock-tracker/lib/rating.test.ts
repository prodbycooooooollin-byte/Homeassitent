import { describe, expect, it } from "vitest";

import { classifyRoles, COMPONENT_ORDER, gradeFor, ratePlayer, ratioScore, ROLE_WEIGHTS } from "./rating";
import { averageBadge, formatBadge } from "./ranks";
import type { MatchDetails, MatchPlayer, RoleKey } from "./types";

/* ---------- Test-Lobby-Generator (deterministisch) ---------- */
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());

// Pro-Minute-Basiswerte je Archetyp (grobe, plausible Größenordnungen)
const ARCH: Record<string, { dmg: number; util: number; tank: number; obj: number; souls: number; k: number; a: number; d: number }> = {
  carry:   { dmg: 1100, util: 20,  tank: 700,  obj: 120, souls: 1100, k: 0.30, a: 0.25, d: 0.17 },
  support: { dmg: 450,  util: 900, tank: 800,  obj: 80,  souls: 850,  k: 0.08, a: 0.55, d: 0.15 },
  tank:    { dmg: 650,  util: 100, tank: 1700, obj: 150, souls: 900,  k: 0.15, a: 0.45, d: 0.18 },
  flex:    { dmg: 850,  util: 150, tank: 900,  obj: 100, souls: 1000, k: 0.22, a: 0.35, d: 0.17 },
};
const COMP = ["carry", "carry", "carry", "support", "tank", "flex"];

function player(id: number, team: 0 | 1, arch: keyof typeof ARCH, skill: number, r: () => number, mins: number, over: Partial<MatchPlayer> = {}): MatchPlayer {
  const A = ARCH[arch], n = () => Math.exp(gauss(r) * 0.12), good = Math.exp(skill);
  const f = (v: number) => Math.round(v * mins * good * n());
  const deaths = Math.max(0, Math.round(A.d * mins * Math.exp(-skill * 0.8 + gauss(r) * 0.25)));
  return {
    accountId: id, team, heroId: ({ carry: 1, support: 2, tank: 3, flex: 4 } as Record<string, number>)[arch], kills: f(A.k), deaths, assists: f(A.a), level: 20, netWorth: f(A.souls), lastHits: 0, denies: 0,
    heroDamage: f(A.dmg), objectiveDamage: f(A.obj), healing: f(A.util * 0.2), allyHealing: f(A.util), mitigated: f(A.tank * 0.5),
    damageTaken: Math.round(A.tank * mins * n()), badge: 50, abandoned: false, ...over,
  };
}
function lobby(seed: number, mins = 30) {
  const r = rng(seed);
  const players: MatchPlayer[] = [];
  const archs: string[] = [];
  for (let i = 0; i < 12; i++) {
    const arch = COMP[i % 6] as keyof typeof ARCH;
    archs.push(arch);
    players.push(player(i + 1, i < 6 ? 0 : 1, arch, gauss(r) * 0.22, r, mins));
  }
  const d: MatchDetails = { matchId: seed, startTime: 0, durationS: mins * 60, winningTeam: r() < 0.5 ? 0 : 1, avgBadge: [50, 50], players };
  return { d, archs };
}

describe("grades & scale", () => {
  it("threshold ladder", () => {
    expect(gradeFor(1.5)).toBe("S");
    expect(gradeFor(1.2)).toBe("A");
    expect(gradeFor(1.0)).toBe("B");
    expect(gradeFor(0.85)).toBe("C");
    expect(gradeFor(0.7)).toBe("D");
    expect(gradeFor(0.3)).toBe("F");
  });
  it("ratio score is 1 at parity and symmetric in log space", () => {
    expect(ratioScore(1)).toBeCloseTo(1, 5);
    expect(ratioScore(2) - 1).toBeCloseTo(1 - ratioScore(0.5), 5);
    expect(ratioScore(100)).toBeLessThan(1.95);
    expect(ratioScore(0)).toBeGreaterThan(0.05);
  });
  it("role weights are defined for all roles", () => {
    for (const k of ["carry", "support", "tank", "pusher", "flex"] as RoleKey[]) {
      expect(Object.values(ROLE_WEIGHTS[k]).reduce((a, b) => a + (b ?? 0), 0)).toBeGreaterThan(0.9);
    }
  });
});

describe("role detection", () => {
  it("recognises supports, frontliners and carries from behaviour", () => {
    const { d } = lobby(5);
    const roles = classifyRoles(d);
    expect(roles.get(4)?.key).toBe("support"); // Spieler 4 = Support (Team 0)
    expect(roles.get(10)?.key).toBe("support");
    expect(roles.get(1)?.key).toBe("carry");
  });
});

describe("role detection: lifesteal is not support", () => {
  it("a carry who heals himself through damage is still a carry", () => {
    const { d } = lobby(51);
    const me = d.players[0]; // Carry
    me.healing = me.healing * 40; // riesige Eigenheilung
    me.allyHealing = 0;
    const r = ratePlayer(d, me.accountId)!;
    expect(r.role.key).toBe("carry");
  });
  it("without ally-healing data nobody is promoted to support by healing alone", () => {
    const { d } = lobby(52);
    for (const p of d.players) { delete p.allyHealing; p.healing = p.healing * 20; }
    for (const p of d.players) expect(ratePlayer(d, p.accountId)!.role.key).not.toBe("support");
  });
  it("missing ally data: the support component drops out, no approximation from self healing", () => {
    const { d } = lobby(53);
    for (const p of d.players) delete p.allyHealing;
    const prior = (id: number) => (id === 2 ? ("support" as const) : null);
    const r = ratePlayer(d, 4, prior)!; // Support-Spieler (heroId 2)
    expect(r.role.key).toBe("support");
    expect(r.components.find((c) => c.key === "utility")!.applicable).toBe(false);
    expect(r.notes.join(" ")).toContain("keine Daten zu Heilung");
  });
});

describe("hero knowledge (e.g. Paige is a support)", () => {
  const support2 = (id: number) => (id === 2 ? ("support" as const) : null);
  it("a support hero is rated as support even with modest healing – and a 0-kill game is not punished", () => {
    const { d } = lobby(61);
    const sup = d.players[3];
    Object.assign(sup, { kills: 0, allyHealing: Math.round((sup.allyHealing ?? 0) * 0.5) });
    const r = ratePlayer(d, sup.accountId, support2)!;
    expect(r.role.key).toBe("support");
    expect(r.role.reason).toContain("Support");
  });
  it("behaviour can overrule a support hero that actually plays pure damage", () => {
    const { d } = lobby(62);
    const sup = d.players[3];
    Object.assign(sup, { heroDamage: sup.heroDamage * 4, allyHealing: 0 });
    expect(ratePlayer(d, sup.accountId, support2)!.role.key).not.toBe("support");
  });
  it("a non-support hero keeps its role even if healing is highest of the team", () => {
    const { d } = lobby(63);
    const car = d.players[0];
    car.allyHealing = (car.allyHealing ?? 0) + 5000; // etwas Unterstützung, aber kein Support-Held
    car.heroDamage = car.heroDamage * 1.3;
    expect(ratePlayer(d, car.accountId, support2)!.role.key).toBe("carry");
  });
});

describe("explanation", () => {
  it("weights sum to 1, inapplicable parts drop out, notes name the role", () => {
    const { d } = lobby(8);
    const r = ratePlayer(d, 1)!;
    expect(r.components.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(1, 2);
    expect(r.components.find((c) => c.key === "lane")?.applicable).toBe(false); // keine Zeitreihen
    expect(r.components.find((c) => c.key === "utility")?.applicable).toBe(false); // Carry hat keinen Support-Baustein
    expect(r.notes[0]).toContain("Rolle erkannt: Carry");
    expect(r.parts).toHaveLength(COMPONENT_ORDER.length);
    expect(r.components.every((c) => !c.applicable || c.detail.length > 0)).toBe(true);
  });
  it("short matches are damped towards 1.0", () => {
    const long = lobby(11, 30), short = lobby(11, 8);
    const a = ratePlayer(long.d, 1)!.score - 1, b = ratePlayer(short.d, 1)!.score - 1;
    expect(Math.abs(b)).toBeLessThanOrEqual(Math.abs(a) + 0.12);
    expect(ratePlayer(short.d, 1)!.notes.join(" ")).toContain("Kurzes Match");
  });
  it("abandoners get F; unknown player gives null", () => {
    const { d } = lobby(3);
    d.players[0].abandoned = true;
    expect(ratePlayer(d, 1)!.grade).toBe("F");
    expect(ratePlayer(d, 999)).toBeNull();
  });
});

describe("fairness for supports", () => {
  it("a strong support with ZERO kills is not punished", () => {
    const { d } = lobby(21);
    const sup = d.players[3], peer = d.players[9]; // Support Team 0 und der Gegen-Support (Vergleichsspieler)
    Object.assign(sup, { kills: 0, heroDamage: Math.round(peer.heroDamage * 0.9), assists: Math.round(peer.assists * 1.3), allyHealing: Math.round((peer.allyHealing ?? 0) * 1.3), deaths: Math.max(1, Math.round(peer.deaths * 0.6)), netWorth: peer.netWorth, objectiveDamage: peer.objectiveDamage });
    const r = ratePlayer(d, sup.accountId)!;
    expect(r.role.key).toBe("support");
    expect(["S", "A", "B"]).toContain(r.grade);
  });
  it("same raw numbers: judged against peers, a support is not rated like a carry", () => {
    const { d } = lobby(22);
    const sup = d.players[3], car = d.players[0];
    // identische, fürs Carry-Profil schwache Kampfwerte – für einen Support aber normal
    for (const p of [sup, car]) Object.assign(p, { kills: 1, heroDamage: 12000 });
    const rs = ratePlayer(d, sup.accountId)!, rc = ratePlayer(d, car.accountId)!;
    expect(rs.score).toBeGreaterThan(rc.score);
  });
  it("a feeder with no impact gets D or F; a dominant carry gets S", () => {
    const { d } = lobby(30);
    Object.assign(d.players[1], { kills: 0, assists: 1, deaths: 16, heroDamage: 6000, netWorth: 12000, objectiveDamage: 0 });
    expect(["D", "F"]).toContain(ratePlayer(d, d.players[1].accountId)!.grade);
    Object.assign(d.players[2], { kills: 22, assists: 14, deaths: 1, heroDamage: 90000, netWorth: 70000, objectiveDamage: 15000 });
    expect(ratePlayer(d, d.players[2].accountId)!.grade).toBe("S");
  });
  it("more support output means a higher support score", () => {
    const base = lobby(40).d;
    const a = ratePlayer(base, 4)!.score;
    base.players[3].allyHealing = (base.players[3].allyHealing ?? 0) * 1.8;
    expect(ratePlayer(base, 4)!.score).toBeGreaterThan(a);
  });
});

describe("balance simulation (same skill ⇒ same expected score regardless of role)", () => {
  const N = 400;
  const byRole: Record<string, number[]> = {};
  const grades: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
  const all: number[] = [];
  for (let s = 1; s <= N; s++) {
    const { d, archs } = lobby(1000 + s, 24 + (s % 20));
    d.players.forEach((p, i) => {
      const r = ratePlayer(d, p.accountId)!;
      (byRole[archs[i]] ??= []).push(r.score);
      grades[r.grade]++;
      all.push(r.score);
    });
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const total = N * 12;

  it("every archetype ends up with about the same average score", () => {
    const mAll = avg(all);
    for (const [role, xs] of Object.entries(byRole)) expect(Math.abs(avg(xs) - mAll), role).toBeLessThan(0.05);
  });
  it("grade distribution is sensible (middle grades most common, extremes rare)", () => {
    const share = (g: string) => grades[g] / total;
    expect(share("S")).toBeGreaterThan(0.03); expect(share("S")).toBeLessThan(0.14);
    expect(share("F")).toBeGreaterThan(0.01); expect(share("F")).toBeLessThan(0.14);
    expect(share("B") + share("C")).toBeGreaterThan(0.40);
  });
  it("supports get S and F as often as carries (no role is locked out of top grades)", () => {
    const rate = (role: string, lo: number, hi: number) => byRole[role].filter((x) => x >= lo && x < hi).length / byRole[role].length;
    expect(Math.abs(rate("support", 1.38, 9) - rate("carry", 1.38, 9))).toBeLessThan(0.06);
    expect(Math.abs(rate("support", -9, 0.62) - rate("carry", -9, 0.62))).toBeLessThan(0.06);
  });
});

describe("ranks", () => {
  it("averages badges linearly", () => {
    expect(averageBadge([61, 65])).toBe(63);
    expect(averageBadge([null, undefined])).toBeNull();
    expect(formatBadge(63)).toBe("Emissary 3");
  });
});
