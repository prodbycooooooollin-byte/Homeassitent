import { laneReports, valueAt } from "./insights";
import type { Goal, MatchDetails, MatchPlayer } from "./types";

/** Ein Match aus Sicht des Spielers, wie es die Trainingsanalyse braucht. */
export interface TrainingMatch {
  details: MatchDetails;
  me: MatchPlayer;
  /** Erkannte Rolle je Spieler (für die Wahl der Vergleichsspieler) */
  roles?: Map<number, string>;
  /** Gesamtnote (Score, 1.0 = Durchschnitt) je Spieler; zur Auswahl der Referenzspieler */
  scores: Map<number, number>;
  won: boolean;
}

export type CurveKey = "nw" | "k" | "d" | "dmg";
export const CURVE_KEYS: CurveKey[] = ["nw", "k", "d", "dmg"];
export const CURVE_LABELS: Record<CurveKey, string> = { nw: "Souls", k: "Kills", d: "Tode", dmg: "Heldenschaden" };
const LOWER_BETTER: Record<CurveKey, boolean> = { nw: false, k: false, d: true, dmg: false };
export const STEPS = 10; // 0..100 % in 10-%-Schritten

export interface ReferencePoint { pct: number; nw: [number, number]; k: [number, number]; d: [number, number]; a: [number, number]; dmg: [number, number] }

export interface CurveSeries {
  key: CurveKey;
  label: string;
  /** Eigener Durchschnitt je Fortschritt (11 Punkte) */
  mine: number[];
  /** Einzelne Matches (blass dargestellt) */
  perMatch: number[][];
  /** Referenz: Mittel und Band (avg .. avg+std) von Spielern ähnlichen Ranges laut API */
  band: { avg: number[]; hi: number[] } | null;
  /** Referenz aus den besten Spielern deiner eigenen Lobbys */
  top: number[] | null;
}

export interface PhaseGap { phase: "Laning" | "Midgame" | "Lategame"; at: number; gapPct: number | null }

export interface DeathStats {
  total: number;
  perMatch: number;
  /** Tode je 5-Minuten-Fenster (Summe über alle Matches) */
  histogram: number[];
  early: number; // Tode in den ersten 4 Minuten, pro Match
  avgRespawnS: number | null;
  killers: { heroId: number; count: number }[];
  /** Anteil der Tode, die in den letzten 30 s eines Teamfight-Todes-Clusters lagen */
  clustered: number;
}

export interface AimStats {
  accuracy: number | null;
  heroHit: number | null;
  crit: number | null;
  lobbyAccuracy: number | null;
  topAccuracy: number | null;
  lobbyHeroHit: number | null;
  topHeroHit: number | null;
  lobbyCrit: number | null;
  topCrit: number | null;
  matches: number;
}

export interface LaneStats { matches: number; avgDiff: number; winRate: number; worst: { matchId: number; diff: number } | null }

/** Erkanntes Muster: Befund mit Belegen und konkreten Schritten, wie du es abstellst. */
export interface Focus {
  id: string;
  severity: "high" | "mid" | "good";
  title: string;
  /** Messwerte, auf denen der Befund beruht */
  evidence: string[];
  /** Konkrete Maßnahmen („So kommst du hin“) */
  fix: string[];
  /** Geschätzte Wirkung, z. B. „≈ +2,1k Souls pro Match“ */
  impact?: string;
}

export interface GoalSuggestion { metric: string; target: number; needed: number; window: number; label: string }

export type SoulKey = "kills" | "lane" | "neutral" | "boss" | "treasure" | "denied";
export const SOUL_LABELS: Record<SoulKey, string> = { kills: "Kills", lane: "Lane-Creeps", neutral: "Neutrale Camps", boss: "Objectives/Boss", treasure: "Kisten", denied: "Denies" };
export interface SoulRow { key: SoulKey; label: string; mine: number; ref: number; gap: number }
export interface SoulPlan {
  rows: SoulRow[];
  /** Souls pro Minute insgesamt: du / Referenz */
  mineTotal: number;
  refTotal: number;
  /** Souls durch Tode verloren, pro Match */
  lostPerMatch: number;
  /** Lane-Creeps: Anteil getroffen (du / Referenz) */
  creepRate: [number, number] | null;
  /** Souls pro Lane-Creep und pro Camp (aus deinen Daten) */
  perCreep: number | null;
  perCamp: number | null;
  campsPerMatch: [number, number] | null;
  basis: number;
}
export interface PhaseRate { label: string; from: number; to: number; mine: number; ref: number }

export interface MetricValue { id: string; label: string; unit: string; lowerIsBetter: boolean; values: { matchId: number; value: number | null; at: number }[] }

export interface TrainingReport {
  matches: number;
  curves: CurveSeries[];
  phases: PhaseGap[];
  deaths: DeathStats;
  aim: AimStats | null;
  lane: LaneStats | null;
  focus: Focus[];
  metrics: MetricValue[];
  soulPlan: SoulPlan | null;
  phaseRates: PhaseRate[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const TL_KEY: Record<CurveKey, "nw" | "k" | "d" | "dmg"> = { nw: "nw", k: "k", d: "d", dmg: "dmg" };

/** Werte eines Spielers bei 0..100 % der Spielzeit. */
export function normalizedCurve(p: MatchPlayer, durationS: number, key: CurveKey): number[] | null {
  if (!p.timeline?.t?.length) return null;
  return Array.from({ length: STEPS + 1 }, (_, i) => valueAt(p.timeline as never, TL_KEY[key], (i / STEPS) * durationS));
}

function averageCurves(curves: number[][]): number[] | null {
  if (!curves.length) return null;
  return Array.from({ length: STEPS + 1 }, (_, i) => mean(curves.map((c) => c[i])));
}

/** Die besten (nach Note) Gegner-/Mitspieler eines Matches außer dir – Maßstab „so spielen die Besten deiner Lobby“. */
export function topPlayers(m: TrainingMatch, n = 2): MatchPlayer[] {
  const all = m.details.players.filter((p) => p.accountId !== m.me.accountId && !p.abandoned && m.scores.has(p.accountId));
  // Vergleich bevorzugt mit Spielern gleicher Rolle (ein Support soll nicht an einem Carry gemessen werden)
  const myRole = m.roles?.get(m.me.accountId);
  const same = myRole ? all.filter((p) => m.roles?.get(p.accountId) === myRole) : [];
  return (same.length >= 1 ? same : all)
    .sort((a, b) => (m.scores.get(b.accountId) ?? 0) - (m.scores.get(a.accountId) ?? 0))
    .slice(0, n);
}

const pct = (a: number, b: number) => (b > 0 ? a / b : null);

function aimOf(p: MatchPlayer) {
  if (p.shotsHit === undefined || p.shotsMissed === undefined) return null;
  const shots = p.shotsHit + p.shotsMissed;
  if (shots < 40) return null;
  return {
    hit: p.shotsHit,
    shots,
    heroHits: p.heroHits ?? 0,
    crits: p.heroCrits ?? 0,
  };
}

export function aimRates(players: MatchPlayer[]) {
  let hit = 0, shots = 0, hh = 0, cr = 0, n = 0;
  for (const p of players) {
    const a = aimOf(p);
    if (!a) continue;
    hit += a.hit; shots += a.shots; hh += a.heroHits; cr += a.crits; n++;
  }
  return { accuracy: pct(hit, shots), heroHit: pct(hh, hit), crit: pct(cr, hh), n };
}

/** Kennzahlen je Match – Grundlage für Ziele und Verlaufsgrafiken. */
export const METRICS: { id: string; label: string; unit: string; lowerIsBetter: boolean; get: (m: TrainingMatch) => number | null }[] = [
  { id: "deaths", label: "Tode", unit: "", lowerIsBetter: true, get: (m) => m.me.deaths },
  { id: "deaths10", label: "Tode pro 10 Min", unit: "", lowerIsBetter: true, get: (m) => (m.details.durationS > 0 ? (m.me.deaths / m.details.durationS) * 600 : null) },
  { id: "soulsMin", label: "Souls pro Minute", unit: "", lowerIsBetter: false, get: (m) => (m.details.durationS > 0 ? m.me.netWorth / (m.details.durationS / 60) : null) },
  { id: "lane8", label: "Lane-Vorsprung bei 8:00", unit: "Souls", lowerIsBetter: false, get: (m) => laneDiff(m) },
  { id: "kda", label: "KDA", unit: "", lowerIsBetter: false, get: (m) => (m.me.kills + m.me.assists) / Math.max(1, m.me.deaths) },
  { id: "accuracy", label: "Trefferquote", unit: "%", lowerIsBetter: false, get: (m) => { const a = aimRates([m.me]).accuracy; return a === null ? null : a * 100; } },
  { id: "denies", label: "Denies", unit: "", lowerIsBetter: false, get: (m) => m.me.denies },
  { id: "soloDeaths", label: "Tode ohne Team", unit: "", lowerIsBetter: true, get: (m) => (m.me.deathLog ? soloDeaths([m]).solo : null) },
  { id: "camps", label: "Neutrale Camps", unit: "", lowerIsBetter: false, get: (m) => m.me.creeps?.neutral ?? null },
  { id: "creepPct", label: "Lane-Creeps getroffen", unit: "%", lowerIsBetter: false, get: (m) => (m.me.creeps && m.me.creeps.possible > 0 ? (m.me.creeps.lane / m.me.creeps.possible) * 100 : null) },
  { id: "deadShare", label: "Anteil tot", unit: "%", lowerIsBetter: true, get: (m) => (m.me.deadTimeS !== undefined ? (m.me.deadTimeS / m.details.durationS) * 100 : null) },
];

export function laneDiff(m: TrainingMatch): number | null {
  if (!m.me.lane || !m.me.timeline) return null;
  const r = laneReports(m.details).find((l) => l.lane === m.me.lane);
  if (!r) return null;
  const mine = r.sides[m.me.team], theirs = r.sides[m.me.team === 0 ? 1 : 0];
  const n = Math.max(1, mine.players.length), o = Math.max(1, theirs.players.length);
  return mine.souls / n - theirs.souls / o;
}

export function analyze(matches: TrainingMatch[], reference: ReferencePoint[] | null): TrainingReport {
  const usable = matches.filter((m) => m.details.durationS >= 600);

  const curves: CurveSeries[] = CURVE_KEYS.map((key) => {
    const per = usable.map((m) => normalizedCurve(m.me, m.details.durationS, key)).filter((c): c is number[] => !!c);
    const tops = usable.flatMap((m) => topPlayers(m).map((p) => normalizedCurve(p, m.details.durationS, key))).filter((c): c is number[] => !!c);
    let band: CurveSeries["band"] = null;
    if (reference?.length) {
      const at = (i: number) => reference.reduce((best, p) => (Math.abs(p.pct - i * (100 / STEPS)) < Math.abs(best.pct - i * (100 / STEPS)) ? p : best), reference[0]);
      const avg = Array.from({ length: STEPS + 1 }, (_, i) => at(i)[key][0]);
      const hi = Array.from({ length: STEPS + 1 }, (_, i) => at(i)[key][0] + at(i)[key][1]);
      if (avg.some((v) => v > 0)) band = { avg, hi };
    }
    return { key, label: CURVE_LABELS[key], mine: averageCurves(per) ?? [], perMatch: per, band, top: averageCurves(tops) };
  });

  // Phasen-Lücke: Souls gegen die beste verfügbare Referenz
  const nw = curves.find((c) => c.key === "nw")!;
  const refNw = nw.band?.avg ?? nw.top;
  const phaseAt = (name: PhaseGap["phase"], idx: number): PhaseGap => {
    const mine = nw.mine[idx], ref = refNw?.[idx];
    return { phase: name, at: idx * 10, gapPct: mine !== undefined && ref && ref > 0 ? mine / ref - 1 : null };
  };
  const phases = nw.mine.length ? [phaseAt("Laning", 3), phaseAt("Midgame", 6), phaseAt("Lategame", 10)] : [];

  // Tode
  const hist = [0, 0, 0, 0, 0, 0, 0, 0];
  const killerCount = new Map<number, number>();
  let total = 0, early = 0, respawn = 0, respawnN = 0, clustered = 0;
  for (const m of usable) {
    const log = m.me.deathLog ?? [];
    const bySlot = new Map(m.details.players.map((p) => [p.slot, p.heroId] as const));
    log.forEach((dth, i) => {
      total++;
      hist[Math.min(hist.length - 1, Math.floor(dth.t / 300))]++;
      if (dth.t < 240) early++;
      if (dth.durS) { respawn += dth.durS; respawnN++; }
      const hero = dth.killerSlot !== undefined ? bySlot.get(dth.killerSlot) : undefined;
      if (hero) killerCount.set(hero, (killerCount.get(hero) ?? 0) + 1);
      if (i > 0 && dth.t - log[i - 1].t <= 45) clustered++;
    });
    if (!log.length) total += m.me.deaths;
  }
  const deaths: DeathStats = {
    total,
    perMatch: usable.length ? total / usable.length : 0,
    histogram: hist,
    early: usable.length ? early / usable.length : 0,
    avgRespawnS: respawnN ? respawn / respawnN : null,
    killers: [...killerCount].map(([heroId, count]) => ({ heroId, count })).sort((a, b) => b.count - a.count).slice(0, 4),
    clustered: total ? clustered / total : 0,
  };

  // Zielgenauigkeit
  const mineAim = aimRates(usable.map((m) => m.me));
  let aim: AimStats | null = null;
  if (mineAim.n > 0) {
    const lobby = aimRates(usable.flatMap((m) => m.details.players.filter((p) => p.accountId !== m.me.accountId)));
    const top = aimRates(usable.flatMap((m) => topPlayers(m)));
    aim = {
      accuracy: mineAim.accuracy, heroHit: mineAim.heroHit, crit: mineAim.crit,
      lobbyAccuracy: lobby.accuracy, topAccuracy: top.accuracy,
      lobbyHeroHit: lobby.heroHit, topHeroHit: top.heroHit,
      lobbyCrit: lobby.crit, topCrit: top.crit, matches: mineAim.n,
    };
  }

  // Lane
  const diffs = usable.map((m) => ({ matchId: m.details.matchId, diff: laneDiff(m) })).filter((x): x is { matchId: number; diff: number } => x.diff !== null);
  const lane: LaneStats | null = diffs.length
    ? { matches: diffs.length, avgDiff: mean(diffs.map((x) => x.diff)), winRate: diffs.filter((x) => x.diff > 0).length / diffs.length, worst: diffs.reduce((w, x) => (x.diff < w.diff ? x : w), diffs[0]) }
    : null;

  const metrics: MetricValue[] = METRICS.map((mt) => ({
    id: mt.id, label: mt.label, unit: mt.unit, lowerIsBetter: mt.lowerIsBetter,
    values: [...matches].sort((a, b) => a.details.startTime - b.details.startTime).map((m) => ({ matchId: m.details.matchId, value: mt.get(m), at: m.details.startTime })),
  }));

  const soulPlan = buildSoulPlan(usable);
  const phaseRates = buildPhaseRates(usable);
  const solo = soloDeaths(usable);
  return { matches: usable.length, curves, phases, deaths, aim, lane, focus: patterns({ usable, phases, deaths, aim, lane, soulPlan, phaseRates, solo, metrics }), metrics, soulPlan, phaseRates };
}

const SOUL_KEYS: SoulKey[] = ["kills", "lane", "neutral", "boss", "treasure", "denied"];

/** Soul-Quellen pro Minute: du gegen die Besten gleicher Rolle in deinen Lobbys. */
function buildSoulPlan(ms: TrainingMatch[]): SoulPlan | null {
  const rows = ms.filter((m) => m.me.souls);
  if (rows.length < 2) return null;
  const mins = (m: TrainingMatch) => m.details.durationS / 60;
  const perMin = (get: (p: MatchPlayer) => number | undefined, who: (m: TrainingMatch) => MatchPlayer[]) => {
    const xs = rows.flatMap((m) => who(m).filter((p) => p.souls).map((p) => (get(p) ?? 0) / mins(m)));
    return mean(xs);
  };
  const mine = (m: TrainingMatch) => [m.me];
  const refP = (m: TrainingMatch) => topPlayers(m).filter((p) => p.souls);
  const out: SoulRow[] = SOUL_KEYS.map((key) => {
    const a = perMin((p) => p.souls?.[key], mine), b = perMin((p) => p.souls?.[key], refP);
    return { key, label: SOUL_LABELS[key], mine: a, ref: b, gap: b - a };
  });
  const mineTotal = mean(rows.map((m) => m.me.netWorth / mins(m)));
  const refTotal = mean(rows.flatMap((m) => refP(m).map((p) => p.netWorth / mins(m))));
  const withCreeps = rows.filter((m) => m.me.creeps && m.me.creeps.possible > 0);
  const rate = (ps: MatchPlayer[]) => { const c = ps.filter((p) => p.creeps && p.creeps.possible > 0); const poss = c.reduce((a, p) => a + (p.creeps?.possible ?? 0), 0); return poss ? c.reduce((a, p) => a + (p.creeps?.lane ?? 0), 0) / poss : null; };
  const myRate = rate(withCreeps.map((m) => m.me)), refRate = rate(withCreeps.flatMap(refP));
  const laneKills = rows.reduce((a, m) => a + (m.me.creeps?.lane ?? 0), 0), laneSouls = rows.reduce((a, m) => a + (m.me.souls?.lane ?? 0), 0);
  const camps = rows.reduce((a, m) => a + (m.me.creeps?.neutral ?? 0), 0), campSouls = rows.reduce((a, m) => a + (m.me.souls?.neutral ?? 0), 0);
  const campsRef = mean(rows.flatMap((m) => refP(m).map((p) => p.creeps?.neutral ?? 0)));
  return {
    rows: out, mineTotal, refTotal, basis: rows.length,
    lostPerMatch: mean(rows.map((m) => m.me.souls?.lost ?? 0)),
    creepRate: myRate !== null && refRate !== null ? [myRate, refRate] : null,
    perCreep: laneKills > 0 ? laneSouls / laneKills : null,
    perCamp: camps > 0 ? campSouls / camps : null,
    campsPerMatch: camps > 0 || campsRef > 0 ? [camps / rows.length, campsRef] : null,
  };
}

const PHASES: [string, number, number][] = [["0–8 Min", 0, 480], ["8–16 Min", 480, 960], ["16–24 Min", 960, 1440], ["ab 24 Min", 1440, 2400]];

/** Souls pro Minute je Spielphase (absolute Zeit): du gegen die Besten gleicher Rolle. */
function buildPhaseRates(ms: TrainingMatch[]): PhaseRate[] {
  const rate = (p: MatchPlayer, d: MatchDetails, a: number, b: number) => {
    if (!p.timeline) return null;
    const end = Math.min(b, d.durationS);
    if (end - a < 120) return null;
    return (valueAt(p.timeline as never, "nw", end) - valueAt(p.timeline as never, "nw", a)) / ((end - a) / 60);
  };
  return PHASES.map(([label, from, to]) => {
    const mine = ms.map((m) => rate(m.me, m.details, from, to)).filter((x): x is number => x !== null);
    const ref = ms.flatMap((m) => topPlayers(m).map((p) => rate(p, m.details, from, to))).filter((x): x is number => x !== null);
    return { label, from, to, mine: mean(mine), ref: mean(ref) };
  }).filter((p) => p.mine > 0 && p.ref > 0);
}

export interface SoloStats { deaths: number; solo: number; soloLate: number }

/** Tode ohne sterbenden Mitspieler innerhalb von 25 s gelten als „allein gestorben“ (Pick-off), Tode mit Team als Teamfight. */
export function soloDeaths(ms: TrainingMatch[]): SoloStats {
  let deaths = 0, solo = 0, soloLate = 0;
  for (const m of ms) {
    const mates = m.details.players.filter((p) => p.team === m.me.team && p.accountId !== m.me.accountId && p.deathLog);
    if (!mates.length) continue;
    for (const d of m.me.deathLog ?? []) {
      deaths++;
      const together = mates.some((p) => p.deathLog!.some((x) => Math.abs(x.t - d.t) <= 25));
      if (!together) { solo++; if (d.t > 720) soloLate++; }
    }
  }
  return { deaths, solo, soloLate };
}

const fmtS = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")}k` : String(Math.round(v)));
const pc = (v: number) => `${Math.round(v * 100)} %`;

const SOUL_FIX: Record<SoulKey, (r: SoulRow, p: SoulPlan) => string[]> = {
  lane: (_, p) => [
    "Bis Minute 8 nur Creeps und Orbs als Ziel: Schüsse auf den Gegner nur, wenn kein Creep kurz vor dem Tod steht.",
    "Den Creep-Wellen-Takt beachten: Nach dem Letzten Treffer sofort den Orb einsammeln, statt direkt weiterzulaufen.",
    ...(p.creepRate ? [`Ziel: von ${pc(p.creepRate[0])} auf mindestens ${pc(Math.min(0.95, p.creepRate[1]))} der möglichen Lane-Creeps.`] : []),
  ],
  neutral: (_, p) => [
    "Nach jedem Respawn zuerst das nächste freie Camp auf dem Weg zur Lane mitnehmen, nicht direkt nach vorne laufen.",
    "Im Midgame (ab etwa Minute 8) feste Camp-Runden zwischen Teamfights einplanen, solange das Team ohne dich nicht kämpft.",
    ...(p.campsPerMatch ? [`Ziel: ${Math.ceil(p.campsPerMatch[1])} Camps pro Match statt ${Math.round(p.campsPerMatch[0])}.`] : []),
  ],
  kills: () => ["Mehr Teamfight-Teilnahme: ein Kill und seine Assist-Orbs bringen gemeinsam mehr als Einzelaktionen.", "Nach gewonnenen Kämpfen sofort Orbs einsammeln, bevor du zurückfällst."],
  boss: () => ["Bei Guardian/Walker- und Boss-Pushes dabei sein: Objectives geben Souls für das ganze Team.", "Wenn dein Team Mid-Boss zieht, früh eintreffen statt erst nach dem Kampf."],
  treasure: () => ["Kisten und Breakables beim Durchlaufen mitnehmen – kostet fast keine Zeit.", "Bei jeder Rotation die Route über sichtbare Kisten legen."],
  denied: () => ["Gegnerische Orbs per Deny abgreifen, wenn die Lane ruhig ist."],
};

interface Ctx {
  usable: TrainingMatch[];
  phases: PhaseGap[];
  deaths: DeathStats;
  aim: AimStats | null;
  lane: LaneStats | null;
  soulPlan: SoulPlan | null;
  phaseRates: PhaseRate[];
  solo: SoloStats;
  metrics: MetricValue[];
}

/** Mustererkennung: Aus den Matches konkrete, belegte Befunde mit Maßnahmen ableiten (nach Wirkung sortiert). */
export function patterns(c: Ctx): Focus[] {
  const out: Focus[] = [];
  const n = c.usable.length;
  if (n < 3) return [{ id: "data", severity: "mid", title: "Noch zu wenig Daten", evidence: ["Weniger als drei vollständige Matches mit Details."], fix: ["Spiele weiter – die Analyse wird ab drei Matches belastbar und ab etwa zehn genau."] }];
  const avgMins = mean(c.usable.map((m) => m.details.durationS / 60)) || 25;

  // 1) Soul-Lücke nach Quelle
  const sp = c.soulPlan;
  if (sp && sp.refTotal > 0) {
    const total = sp.refTotal - sp.mineTotal;
    const ranked = [...sp.rows].filter((r) => r.gap > 0).sort((a, b) => b.gap - a.gap);
    if ((total > sp.refTotal * 0.06 || (ranked[0] && ranked[0].gap > sp.refTotal * 0.1)) && ranked.length) {
      const top = ranked[0];
      const ev = [total > 0 ? `Gesamt: ${Math.round(sp.mineTotal)} Souls/Min bei dir, ${Math.round(sp.refTotal)} bei den Besten deiner Lobbys (−${Math.round(total)}/Min ≈ ${fmtS(total * avgMins)} Souls pro Match).` : `Gesamt liegst du bei ${Math.round(sp.mineTotal)} Souls/Min (Beste ${Math.round(sp.refTotal)}), aber eine Quelle bricht deutlich ein:`];
      for (const r of ranked.slice(0, 3)) ev.push(`${r.label}: ${Math.round(r.mine)}/Min statt ${Math.round(r.ref)}/Min (−${Math.round(r.gap)}).`);
      if (top.key === "lane" && sp.creepRate) ev.push(`Du triffst ${pc(sp.creepRate[0])} der möglichen Lane-Creeps, die Besten ${pc(sp.creepRate[1])}.`);
      if (top.key === "neutral" && sp.campsPerMatch && sp.perCamp) ev.push(`${sp.campsPerMatch[0].toFixed(1).replace(".", ",")} Camps pro Match (Beste ${sp.campsPerMatch[1].toFixed(1).replace(".", ",")}), je ca. ${Math.round(sp.perCamp)} Souls.`);
      const fix = [...SOUL_FIX[top.key](top, sp)];
      if (ranked[1] && ranked[1].gap > top.gap * 0.6) fix.push(`Zweite Baustelle: ${ranked[1].label} (−${Math.round(ranked[1].gap)}/Min).`);
      out.push({ id: "souls", severity: total > sp.refTotal * 0.15 || top.gap > sp.refTotal * 0.15 ? "high" : "mid", title: `Dir fehlen Souls – größte Lücke: ${top.label}`, evidence: ev, fix, impact: `≈ +${fmtS(top.gap * avgMins)} Souls pro Match allein durch ${top.label}` });
    } else if (total < -sp.refTotal * 0.05) {
      out.push({ id: "souls-good", severity: "good", title: "Souls über dem Vergleich", evidence: [`${Math.round(sp.mineTotal)} Souls/Min gegen ${Math.round(sp.refTotal)} bei den Besten deiner Lobbys.`], fix: ["Halte das Niveau – und setze die gewonnene Wirtschaft früher in Items um."] });
    }
  }

  // 2) Wo die Lücke entsteht
  if (c.phaseRates.length >= 2) {
    const worst = [...c.phaseRates].sort((a, b) => (a.mine / a.ref) - (b.mine / b.ref))[0];
    const ratio = worst.mine / worst.ref;
    if (ratio < 0.88) out.push({
      id: "phase-gap", severity: ratio < 0.78 ? "high" : "mid", title: `Dein Einbruch liegt in der Phase ${worst.label}`,
      evidence: c.phaseRates.map((p) => `${p.label}: ${Math.round(p.mine)} Souls/Min (Beste ${Math.round(p.ref)}) – ${p.mine >= p.ref ? "+" : "−"}${Math.round(Math.abs(1 - p.mine / p.ref) * 100)} %`),
      fix: worst.from === 0
        ? ["Lane sauberer spielen: Creep-Takt, Orbs sofort einsammeln, Denies nutzen.", "Wenn die Lane verloren geht: früh zum Jungle wechseln statt Souls zu verschenken."]
        : worst.from < 1000
          ? ["Nach der Lane keinen Leerlauf: nach Lane-Ende direkt Camps, Kisten und Objectives verbinden.", "Zwischen Teamfights Camp-Runden einplanen."]
          : ["Im Lategame mehr Souls über Objectives, Mid-Boss und Teamfight-Teilnahme holen; Alleingänge vermeiden (lange Respawns).", "Ungenutzte Souls sofort in Items stecken."],
    });
  }

  // 3) Allein gestorben
  if (c.solo.deaths >= 12) {
    const share = c.solo.solo / c.solo.deaths;
    if (share >= 0.45) out.push({
      id: "solo-deaths", severity: share >= 0.6 ? "high" : "mid", title: "Du stirbst überwiegend allein",
      evidence: [`${pc(share)} deiner Tode (${c.solo.solo} von ${c.solo.deaths}) passieren, ohne dass in 25 Sekunden ein Mitspieler fällt.`, ...(c.solo.soloLate > 0 ? [`${c.solo.soloLate} davon nach Minute 12 – dort dauern Respawns am längsten.`] : []), ...(c.deaths.avgRespawnS ? [`Ø Respawn ${Math.round(c.deaths.avgRespawnS)} s.`] : [])],
      fix: ["Nach Minute 12 nur flankieren, wenn mindestens ein Mitspieler in Reichweite ist.", "Bei niedriger Lebensenergie zurückziehen statt „noch einen“ Kampf mitzunehmen.", "Auf die Minimap schauen: fehlt ein Gegner, rechne mit einer Flanke."],
      impact: `≈ ${Math.round(c.solo.solo / n * 10) / 10} vermeidbare Tode pro Match`,
    });
    else if (share <= 0.25) out.push({ id: "fight-deaths", severity: "mid", title: "Deine Tode fallen fast nur in Teamfights", evidence: [`${pc(1 - share)} deiner Tode geschehen zusammen mit einem Mitspieler.`], fix: ["Im Kampf früher zurückziehen, wenn der erste Mitspieler fällt – Überleben nach verlorenem Fight sichert die nächste Objective.", "Fokus auf Positionierung hinter dem Frontliner."] });
  }

  // 4) Tote Zeit
  const dead = c.usable.filter((m) => m.me.deadTimeS !== undefined);
  if (dead.length >= 3) {
    const share = mean(dead.map((m) => (m.me.deadTimeS ?? 0) / m.details.durationS));
    if (share >= 0.14) {
      const perMin = sp?.mineTotal ?? mean(dead.map((m) => m.me.netWorth / (m.details.durationS / 60)));
      out.push({ id: "dead-time", severity: share >= 0.2 ? "high" : "mid", title: `Du bist ${pc(share)} des Matches tot`, evidence: [`Ø ${Math.round(mean(dead.map((m) => m.me.deadTimeS ?? 0)) / 60 * 10) / 10} Minuten pro Match im Respawn.`, `Das sind etwa ${fmtS(share * avgMins * perMin)} nicht gefarmte Souls pro Match${sp && sp.lostPerMatch > 0 ? `, dazu ${fmtS(sp.lostPerMatch)} Souls direkt durch Tode verloren` : ""}.`], fix: ["Jeder vermiedene Tod spart Respawn-Zeit und Souls – besonders spät im Match.", "Bei hoher Lebensenergie nicht ohne Mobilitäts-/Rettungs-Fähigkeit in 2-gegen-1 laufen."], impact: `≈ ${fmtS(share * avgMins * perMin)} Souls pro Match` });
    }
  }

  // 5) Lane: vorne/hinten und Folgen
  if (c.lane && c.lane.matches >= 4) {
    const mt = c.metrics.find((x) => x.id === "lane8")!.values;
    const ahead = c.usable.filter((m) => (mt.find((v) => v.matchId === m.details.matchId)?.value ?? 0) > 0), behind = c.usable.filter((m) => (mt.find((v) => v.matchId === m.details.matchId)?.value ?? 0) < 0);
    const wr = (xs: TrainingMatch[]) => (xs.length ? xs.filter((m) => m.won).length / xs.length : null);
    const wa = wr(ahead), wb = wr(behind);
    if (wa !== null && wb !== null && ahead.length >= 2 && behind.length >= 2 && wa - wb >= 0.2) out.push({ id: "lane-snowball", severity: "mid", title: "Die Lane entscheidet deine Matches", evidence: [`Mit Lane-Vorsprung bei 8:00 gewinnst du ${pc(wa)} (${ahead.length} Matches), mit Rückstand nur ${pc(wb)} (${behind.length}).`, `Ø Lane-Differenz: ${c.lane.avgDiff >= 0 ? "+" : ""}${Math.round(c.lane.avgDiff)} Souls.`], fix: ["Vorsprung früh nutzen: Gegner nicht mehr farmen lassen, dann rotieren.", "Bei Rückstand: nicht in der Lane festhängen, früh Jungle und Teamfights suchen – die Lane einzeln aufzuholen ist selten der Weg."] });
    else if (c.lane.avgDiff < -250) out.push({ id: "lane", severity: "high", title: "Du verlierst die Lane", evidence: [`Bei 8:00 liegst du im Schnitt ${Math.round(-c.lane.avgDiff)} Souls hinter deinem Gegner (nur ${pc(c.lane.winRate)} der Lanes gewonnen).`], fix: ["Creep-Takt und Orbs: in den ersten Minuten keine Schüsse auf den Gegner, wenn ein Creep letzte Treffer braucht.", "Gegner-Cooldowns merken, bevor du dich vorne positionierst."] });
  }

  // 6) Frühe Tode
  if (c.deaths.early >= 1) out.push({ id: "early-deaths", severity: "high", title: "Zu viele frühe Tode", evidence: [`Ø ${c.deaths.early.toFixed(1).replace(".", ",")} Tode in den ersten 4 Minuten pro Match.`], fix: ["Die ersten Minuten defensiver spielen: kein Trade, wenn der Gegner mehr Leben hat.", "Respawn-Zeit ist früh kurz – aber der Souls-Rückstand bleibt."] });

  // 7) Treffer
  if (c.aim) {
    const ref = c.aim.topAccuracy ?? c.aim.lobbyAccuracy;
    const bits: string[] = [];
    if (c.aim.accuracy !== null && ref && c.aim.accuracy < ref - 0.04) bits.push(`Trefferquote ${pc(c.aim.accuracy)} (Beste ${pc(ref)})`);
    const hh = c.aim.topHeroHit ?? c.aim.lobbyHeroHit;
    if (c.aim.heroHit !== null && hh && c.aim.heroHit < hh - 0.05) bits.push(`Treffer auf Helden ${pc(c.aim.heroHit)} (Beste ${pc(hh)})`);
    const cr = c.aim.topCrit ?? c.aim.lobbyCrit;
    if (c.aim.crit !== null && cr && c.aim.crit < cr - 0.03) bits.push(`Kopftreffer ${pc(c.aim.crit)} (Beste ${pc(cr)})`);
    if (bits.length) out.push({ id: "aim", severity: bits.length >= 2 ? "high" : "mid", title: "Zielgenauigkeit unter den Besten", evidence: bits, fix: ["Kurze Salven statt Dauerfeuer, wenn die Waffe streut.", "Fadenkreuz in Kopfhöhe vorpositionieren, statt nach dem Zielen zu korrigieren.", "Im Kampf Helden priorisieren, Creeps nur ohne Gegner in Sicht."] });
  }

  // 8) Item-Tempo
  const items = c.usable.filter((m) => m.me.items?.length);
  if (items.length >= 3) {
    const byMin = (p: MatchPlayer, t: number) => (p.items ?? []).filter((i) => i.t <= t).length;
    const mine = mean(items.map((m) => byMin(m.me, 600))), ref = mean(items.flatMap((m) => topPlayers(m).filter((p) => p.items?.length).map((p) => byMin(p, 600))));
    if (ref > 0 && mine < ref - 1) out.push({ id: "item-tempo", severity: "mid", title: "Items kommen zu spät", evidence: [`Bis Minute 10 kaufst du Ø ${mine.toFixed(1).replace(".", ",")} Items, die Besten ${ref.toFixed(1).replace(".", ",")}.`], fix: ["Souls nicht ansammeln: nach jedem Tod/Respawn im Shop kaufen.", "Kauf-Reihenfolge vor dem Match festlegen (günstige Early-Items zuerst)."] });
  }

  if (!out.some((f) => f.severity !== "good")) out.unshift({ id: "solid", severity: "good", title: "Keine großen Schwächen erkennbar", evidence: ["Deine Werte liegen nah an den Besten deiner Lobbys."], fix: ["Setze dir ein konkretes Ziel, um dich weiter zu steigern."] });
  const order = { high: 0, mid: 1, good: 2 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}


/** Fortschritt eines Ziels: gezählt werden die letzten `window` Matches nach Erstellung. */
export function goalProgress(goal: Goal, metrics: MetricValue[]): { hits: number; played: number; done: boolean; pctDone: number; unknown: boolean } {
  const m = metrics.find((x) => x.id === goal.metric);
  if (!m) return { hits: 0, played: 0, done: false, pctDone: 0, unknown: true };
  const vals = m.values.filter((v) => v.value !== null && v.at >= goal.createdAt).slice(-goal.window);
  const hits = vals.filter((v) => (goal.lowerIsBetter ? (v.value as number) <= goal.target : (v.value as number) >= goal.target)).length;
  return { hits, played: vals.length, done: hits >= goal.needed, pctDone: Math.min(1, hits / goal.needed), unknown: false };
}
