import { laneDiff, aimRates, soloDeaths, topPlayers, type GoalSuggestion, type TrainingMatch, type TrainingReport } from "./training";
import { reasonsFor, type Reason } from "./training-reasons";
import type { MatchPlayer } from "./types";

/* Aufbereitung der Trainingsanalyse für die Seite: Fähigkeiten-Scorecard, Hauptproblem, letztes Match. */

export type SkillId = "lane" | "farming" | "jungle" | "survival" | "teamplay" | "objectives" | "items" | "aim";
export interface SkillView {
  id: SkillId; label: string;
  /** Prozent des Referenzniveaus (100 = so gut wie die Besten deiner Lobbys / dein Lane-Gegner) – null ohne Daten */
  pct: number | null;
  /** Veränderung gegenüber der ersten Hälfte der Matches in Prozentpunkten */
  trend: number | null;
  line: string;
  /** Muster (Focus-IDs), die diese Fähigkeit erklären */
  focusIds: string[];
}
export interface Problem {
  skill: SkillId; headline: string;
  figure: { label: string; mine: string; ref: string; refLabel: string; ratio: number };
  action: string; impact?: string; goal?: GoalSuggestion;
}
export interface MatchLine { tone: "good" | "bad"; text: string; w: number }
export interface LastMatchView { matchId: number; heroId: number; won: boolean; lines: MatchLine[] }
export interface TrainingView { skills: SkillView[]; problem: Problem | null; last: LastMatchView | null; reasons: Partial<Record<SkillId, Reason[]>> }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const nn = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);
const clamp = (v: number, lo = 0, hi = 150) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => (Math.round(v * 10) / 10).toString().replace(".", ",");
const pc = (v: number) => `${Math.round(v * 100)} %`;

type Stat = (p: MatchPlayer, m: TrainingMatch) => number | null;
/** Mittelwert von dir und von den Referenzspielern (Beste gleicher Rolle) – null bei zu wenig Daten. */
function pair(ms: TrainingMatch[], f: Stat): [number, number] | null {
  const mine = ms.map((m) => f(m.me, m)).filter(nn);
  const ref = ms.flatMap((m) => topPlayers(m).map((p) => f(p, m))).filter(nn);
  return mine.length >= 2 && ref.length >= 2 ? [mean(mine), mean(ref)] : null;
}
const perMin = (v: number, m: TrainingMatch) => v / Math.max(1, m.details.durationS / 60);
const S: Record<string, Stat> = {
  creepRate: (p) => (p.creeps && p.creeps.possible > 0 ? p.creeps.lane / p.creeps.possible : null),
  neutralMin: (p, m) => (p.souls ? perMin(p.souls.neutral, m) : null),
  deathsMin: (p, m) => perMin(p.deaths, m),
  objMin: (p, m) => perMin(p.objectiveDamage, m),
  items10: (p) => (p.items?.length ? p.items.filter((i) => i.t <= 600).length : null),
  accuracy: (p) => { const a = aimRates([p]).accuracy; return a; },
};

function skillOf(id: SkillId, ms: TrainingMatch[]): { pct: number; line: string } | null {
  switch (id) {
    case "lane": {
      const d = ms.map(laneDiff).filter(nn);
      if (d.length < 3) return null;
      const a = mean(d);
      return { pct: clamp(100 + a / 8), line: `${a >= 0 ? "+" : "−"}${Math.abs(Math.round(a))} Souls bei 8:00` };
    }
    case "farming": { const x = pair(ms, S.creepRate); return x && x[1] > 0 ? { pct: clamp((x[0] / x[1]) * 100), line: `${pc(x[0])} der Creeps (Beste ${pc(x[1])})` } : null; }
    case "jungle": { const x = pair(ms, S.neutralMin); return x && x[1] > 0 ? { pct: clamp((x[0] / x[1]) * 100), line: `${Math.round(x[0])}/Min aus Camps (Beste ${Math.round(x[1])})` } : null; }
    case "survival": { const x = pair(ms, S.deathsMin); return x ? { pct: clamp(x[0] <= 0 ? 150 : (x[1] / x[0]) * 100), line: `${r1(x[0] * 10)} Tode/10 Min (Beste ${r1(x[1] * 10)})` } : null; }
    case "teamplay": {
      const s = soloDeaths(ms);
      if (s.deaths < 8) return null;
      const share = s.solo / s.deaths;
      return { pct: clamp(share <= 0 ? 150 : (0.35 / share) * 100), line: `${pc(share)} deiner Tode allein` };
    }
    case "objectives": { const x = pair(ms, S.objMin); return x && x[1] > 0 ? { pct: clamp((x[0] / x[1]) * 100), line: `${Math.round(x[0])}/Min Objective-Schaden (Beste ${Math.round(x[1])})` } : null; }
    case "items": { const x = pair(ms, S.items10); return x && x[1] > 0 ? { pct: clamp((x[0] / x[1]) * 100), line: `${r1(x[0])} Items bis Min. 10 (Beste ${r1(x[1])})` } : null; }
    case "aim": { const x = pair(ms, S.accuracy); return x && x[1] > 0 ? { pct: clamp((x[0] / x[1]) * 100), line: `${pc(x[0])} Trefferquote (Beste ${pc(x[1])})` } : null; }
  }
}

const META: { id: SkillId; label: string; focusIds: string[] }[] = [
  { id: "lane", label: "Lane", focusIds: ["lane", "lane-snowball", "early-deaths"] },
  { id: "farming", label: "Farming", focusIds: ["souls", "phase-gap"] },
  { id: "jungle", label: "Jungle", focusIds: ["souls", "phase-gap"] },
  { id: "survival", label: "Überleben", focusIds: ["dead-time", "early-deaths"] },
  { id: "teamplay", label: "Teamplay", focusIds: ["solo-deaths", "fight-deaths"] },
  { id: "objectives", label: "Objectives", focusIds: [] },
  { id: "items", label: "Item-Tempo", focusIds: ["item-tempo"] },
  { id: "aim", label: "Zielen", focusIds: ["aim"] },
];

export function buildView(ms: TrainingMatch[], report: TrainingReport): TrainingView {
  const usable = ms.filter((m) => m.details.durationS >= 600);
  const sorted = [...usable].sort((a, b) => a.details.startTime - b.details.startTime);
  const half = Math.floor(sorted.length / 2);
  const old = sorted.slice(0, half), recent = sorted.slice(half);
  const skills: SkillView[] = META.map((mt) => {
    const now = skillOf(mt.id, usable);
    const a = sorted.length >= 8 ? skillOf(mt.id, old) : null, b = sorted.length >= 8 ? skillOf(mt.id, recent) : null;
    return { id: mt.id, label: mt.label, pct: now ? Math.round(now.pct) : null, trend: a && b ? Math.round(b.pct - a.pct) : null, line: now?.line ?? "Zu wenig Daten", focusIds: mt.focusIds };
  });
  const reasons: Partial<Record<SkillId, Reason[]>> = {};
  for (const sk of skills) if (sk.pct !== null) reasons[sk.id] = reasonsFor(sk.id, usable);
  return { skills, problem: problemOf(skills, usable, report), last: lastMatch(usable), reasons };
}

function problemOf(skills: SkillView[], ms: TrainingMatch[], r: TrainingReport): Problem | null {
  const weak = skills.filter((s) => s.pct !== null).sort((a, b) => (a.pct as number) - (b.pct as number))[0];
  if (!weak || (weak.pct as number) >= 92) return null;
  const n = Math.max(1, ms.length), mins = mean(ms.map((m) => m.details.durationS / 60)) || 25;
  const fix = (...ids: string[]) => r.focus.find((f) => ids.includes(f.id))?.fix[0];
  const ratio = Math.min(1.5, (weak.pct as number) / 100);
  const sp = r.soulPlan;
  switch (weak.id) {
    case "farming": {
      const x = pair(ms, S.creepRate)!;
      const perCreep = sp?.perCreep ?? 100;
      const poss = mean(ms.map((m) => m.me.creeps?.possible ?? 0));
      const gain = Math.max(0, (x[1] - x[0]) * poss * perCreep);
      return { skill: "farming", headline: `Du triffst nur ${pc(x[0])} der Lane-Creeps – die Besten ${pc(x[1])}`, figure: { label: "Lane-Creeps getroffen", mine: pc(x[0]), ref: pc(x[1]), refLabel: "Beste", ratio }, action: fix("souls") ?? "Bis Minute 8 Creeps und Orbs vor Trades gegen den Gegner priorisieren.", impact: gain > 300 ? `≈ +${Math.round(gain / 100) / 10}k Souls pro Match` : undefined, goal: { metric: "creepPct", target: Math.min(95, Math.round(x[0] * 100) + 6), needed: 3, window: 5, label: `Mindestens ${Math.min(95, Math.round(x[0] * 100) + 6)} % der Lane-Creeps treffen` } };
    }
    case "jungle": {
      const x = pair(ms, S.neutralMin)!;
      const camps = mean(ms.map((m) => m.me.creeps?.neutral ?? 0));
      return { skill: "jungle", headline: `Du holst ${Math.round(x[0])} Souls/Min aus Camps – die Besten ${Math.round(x[1])}`, figure: { label: "Souls aus Camps pro Minute", mine: String(Math.round(x[0])), ref: String(Math.round(x[1])), refLabel: "Beste", ratio }, action: "Nach jedem Respawn zuerst das nächste freie Camp auf dem Weg zur Lane mitnehmen.", impact: `≈ +${r1(((x[1] - x[0]) * mins) / 1000)}k Souls pro Match`, goal: { metric: "camps", target: Math.round(camps) + 2, needed: 3, window: 5, label: `Mindestens ${Math.round(camps) + 2} Camps pro Match` } };
    }
    case "lane": {
      const d = mean(ms.map(laneDiff).filter(nn));
      return { skill: "lane", headline: `Bei 8:00 liegst du ${Math.abs(Math.round(d))} Souls ${d < 0 ? "hinter" : "vor"} deinem Lane-Gegner`, figure: { label: "Souls-Differenz bei 8:00", mine: `${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d))}`, ref: "±0", refLabel: "Gegner", ratio }, action: fix("lane", "lane-snowball") ?? "Creep-Takt und Orbs: in den ersten Minuten keine Schüsse auf den Gegner, wenn ein Creep letzte Treffer braucht.", goal: { metric: "lane8", target: 0, needed: 3, window: 5, label: "Lane bei 8:00 nicht verlieren" } };
    }
    case "survival": {
      const x = pair(ms, S.deathsMin)!;
      return { skill: "survival", headline: `Du stirbst ${r1(x[0] * 10)}× pro 10 Minuten – die Besten ${r1(x[1] * 10)}×`, figure: { label: "Tode pro 10 Min", mine: r1(x[0] * 10), ref: r1(x[1] * 10), refLabel: "Beste", ratio }, action: fix("early-deaths", "dead-time", "solo-deaths") ?? "Bei niedriger Lebensenergie früher zurückziehen.", goal: { metric: "deaths10", target: Math.round(x[1] * 10 * 1.1 * 10) / 10, needed: 3, window: 5, label: `Höchstens ${r1(x[1] * 10 * 1.1)} Tode pro 10 Min` } };
    }
    case "teamplay": {
      const s = soloDeaths(ms);
      const per = s.solo / n;
      return { skill: "teamplay", headline: `${pc(s.solo / s.deaths)} deiner Tode passieren allein`, figure: { label: "Tode ohne Mitspieler", mine: pc(s.solo / s.deaths), ref: "35 %", refLabel: "Richtwert", ratio }, action: fix("solo-deaths") ?? "Nach Minute 12 nur mit mindestens einem Mitspieler in Reichweite flankieren.", impact: `≈ ${r1(per)} vermeidbare Tode pro Match`, goal: { metric: "soloDeaths", target: Math.max(1, Math.round(per * 0.6)), needed: 3, window: 5, label: `Höchstens ${Math.max(1, Math.round(per * 0.6))} Tode allein pro Match` } };
    }
    case "objectives": {
      const x = pair(ms, S.objMin)!;
      return { skill: "objectives", headline: `Dein Objective-Schaden liegt bei ${Math.round((weak.pct as number))} % der Besten`, figure: { label: "Objective-Schaden pro Min", mine: String(Math.round(x[0])), ref: String(Math.round(x[1])), refLabel: "Beste", ratio }, action: "Bei Walker- und Guardian-Pushes dabei sein, statt nur auf Kills zu spielen." };
    }
    case "items": {
      const x = pair(ms, S.items10)!;
      return { skill: "items", headline: `Bis Minute 10 kaufst du ${r1(x[0])} Items – die Besten ${r1(x[1])}`, figure: { label: "Items bis Minute 10", mine: r1(x[0]), ref: r1(x[1]), refLabel: "Beste", ratio }, action: "Souls nicht ansammeln: nach jedem Tod/Respawn im Shop kaufen." };
    }
    case "aim": {
      const x = pair(ms, S.accuracy)!;
      return { skill: "aim", headline: `Du triffst ${pc(x[0])} deiner Schüsse – die Besten ${pc(x[1])}`, figure: { label: "Trefferquote", mine: pc(x[0]), ref: pc(x[1]), refLabel: "Beste", ratio }, action: "Kurze Salven statt Dauerfeuer und das Fadenkreuz in Kopfhöhe vorpositionieren.", goal: { metric: "accuracy", target: Math.round(x[1] * 100) - 2, needed: 3, window: 5, label: `Mindestens ${Math.round(x[1] * 100) - 2} % Trefferquote` } };
    }
  }
  return null;
}

/** Das neueste Match: bis zu 2 Stärken und 3 Schwächen. */
function lastMatch(ms: TrainingMatch[]): LastMatchView | null {
  const m = [...ms].sort((a, b) => b.details.startTime - a.details.startTime)[0];
  if (!m) return null;
  const lines: MatchLine[] = [];
  const add = (tone: "good" | "bad", text: string, w: number) => lines.push({ tone, text, w });
  const ld = laneDiff(m);
  if (ld !== null) add(ld >= 0 ? "good" : "bad", `Lane bei 8:00: ${ld >= 0 ? "+" : "−"}${Math.abs(Math.round(ld))} Souls`, Math.abs(ld) / 300);
  const solo = m.me.deathLog ? soloDeaths([m]) : null;
  if (solo && solo.deaths > 0) add(solo.solo / solo.deaths > 0.5 ? "bad" : "good", `${solo.solo} von ${solo.deaths} Toden allein`, solo.solo / 3);
  const top = topPlayers(m);
  const topCamps = mean(top.map((p) => p.creeps?.neutral).filter(nn));
  if (m.me.creeps && topCamps > 0) add(m.me.creeps.neutral >= topCamps * 0.9 ? "good" : "bad", `Camps: ${m.me.creeps.neutral} (Beste ${Math.round(topCamps)})`, Math.abs(topCamps - m.me.creeps.neutral) / 4);
  const mins = m.details.durationS / 60, topSouls = mean(top.map((p) => p.netWorth / mins));
  if (topSouls > 0) { const mine = m.me.netWorth / mins; add(mine >= topSouls * 0.95 ? "good" : "bad", `Souls: ${Math.round(mine)}/Min (Beste ${Math.round(topSouls)})`, Math.abs(topSouls - mine) / 150); }
  const topDeaths = mean(top.map((p) => p.deaths));
  if (top.length) add(m.me.deaths <= topDeaths + 0.5 ? "good" : "bad", `Tode: ${m.me.deaths} (Beste ${r1(topDeaths)})`, Math.abs(m.me.deaths - topDeaths) / 3);
  const acc = aimRates([m.me]).accuracy, topAcc = aimRates(top).accuracy;
  if (acc !== null && topAcc !== null) add(acc >= topAcc - 0.02 ? "good" : "bad", `Trefferquote ${pc(acc)} (Beste ${pc(topAcc)})`, Math.abs(topAcc - acc) * 10);
  const good = lines.filter((l) => l.tone === "good").sort((a, b) => b.w - a.w).slice(0, 2);
  const bad = lines.filter((l) => l.tone === "bad").sort((a, b) => b.w - a.w).slice(0, 3);
  return { matchId: m.details.matchId, heroId: m.me.heroId, won: m.won, lines: [...good, ...bad] };
}
