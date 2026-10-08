import { laneReports, valueAt } from "./insights";
import type { Goal, MatchDetails, MatchPlayer } from "./types";

/** Ein Match aus Sicht des Spielers, wie es die Trainingsanalyse braucht. */
export interface TrainingMatch {
  details: MatchDetails;
  me: MatchPlayer;
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

export interface Focus {
  id: string;
  severity: "high" | "mid" | "good";
  title: string;
  detail: string;
  drill?: "lasthit" | "aim";
}

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
function topPlayers(m: TrainingMatch, n = 2): MatchPlayer[] {
  return m.details.players
    .filter((p) => p.accountId !== m.me.accountId && !p.abandoned && m.scores.has(p.accountId))
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

function aimRates(players: MatchPlayer[]) {
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
];

function laneDiff(m: TrainingMatch): number | null {
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

  return { matches: usable.length, curves, phases, deaths, aim, lane, focus: coach({ phases, deaths, aim, lane, curves, n: usable.length }), metrics };
}

/** Regelbasierte Hinweise – sortiert nach Dringlichkeit. */
export function coach(r: { phases: PhaseGap[]; deaths: DeathStats; aim: AimStats | null; lane: LaneStats | null; curves: CurveSeries[]; n: number }): Focus[] {
  const out: Focus[] = [];
  if (r.n < 3) return [{ id: "data", severity: "mid", title: "Noch zu wenig Daten", detail: "Spiele mindestens drei vollständige Matches mit geladenen Details, dann wird die Analyse belastbar." }];

  if (r.lane && r.lane.matches >= 3) {
    if (r.lane.avgDiff < -250 || r.lane.winRate < 0.35) {
      out.push({ id: "lane", severity: "high", title: "Du verlierst die Lane", detail: `Bei 8:00 liegst du im Schnitt ${Math.round(Math.abs(r.lane.avgDiff))} Souls hinter deinem Gegner (Lane in ${Math.round(r.lane.winRate * 100)} % der Matches gewonnen). Konzentriere dich auf saubere letzte Treffer und Denies.`, drill: "lasthit" });
    } else if (r.lane.avgDiff > 250) {
      out.push({ id: "lane", severity: "good", title: "Starke Lane", detail: `Du gewinnst die Lane im Schnitt mit ${Math.round(r.lane.avgDiff)} Souls Vorsprung – nutze das, um früher zu rotieren.` });
    }
  }

  const early = r.phases.find((p) => p.phase === "Laning")?.gapPct;
  const late = r.phases.find((p) => p.phase === "Lategame")?.gapPct;
  if (early != null && early < -0.12) out.push({ id: "econ-early", severity: "high", title: "Souls: schwacher Start", detail: `Bei 30 % der Spielzeit hast du ${Math.round(-early * 100)} % weniger Souls als die Referenz. Prüfe Wegstrecken zwischen Camps und Lane sowie verpasste Creeps.`, drill: "lasthit" });
  if (late != null && late < -0.12 && !(early != null && early < -0.12)) out.push({ id: "econ-late", severity: "mid", title: "Souls: Einbruch im Lategame", detail: `Du startest solide, fällst aber zum Ende ${Math.round(-late * 100)} % hinter die Referenz zurück. Mehr Camps/Boxen in ruhigen Phasen und weniger Tode im späten Spiel helfen.` });
  if (early != null && late != null && early > 0.05 && late > 0.05) out.push({ id: "econ-good", severity: "good", title: "Wirtschaft über der Referenz", detail: "Deine Soul-Kurve liegt durchgehend über dem Vergleichswert – das ist eine echte Stärke." });

  if (r.deaths.early >= 1.2) out.push({ id: "early-deaths", severity: "high", title: "Zu viele frühe Tode", detail: `Im Schnitt ${r.deaths.early.toFixed(1)} Tode in den ersten 4 Minuten. Spiele die ersten Minuten defensiver und achte auf Gegner-Cooldowns, bevor du pushst.` });
  if (r.deaths.clustered >= 0.35) out.push({ id: "chain-deaths", severity: "mid", title: "Serien-Tode", detail: `${Math.round(r.deaths.clustered * 100)} % deiner Tode folgen innerhalb von 45 Sekunden auf den vorherigen. Nach einem Tod nicht sofort wieder in den Kampf rennen – Respawn abwarten und mit dem Team gehen.` });
  const late5 = r.deaths.histogram.slice(4).reduce((a, b) => a + b, 0);
  if (r.deaths.total >= 10 && late5 / r.deaths.total > 0.5) out.push({ id: "late-deaths", severity: "mid", title: "Späte Tode kosten viel", detail: "Mehr als die Hälfte deiner Tode fällt nach Minute 20 – dort dauern Respawns am längsten. Vermeide Alleingänge und Flanken ohne Absicherung." });
  if (r.deaths.perMatch > 0 && r.deaths.killers[0] && r.deaths.killers[0].count / Math.max(1, r.deaths.total) >= 0.25) out.push({ id: "nemesis", severity: "mid", title: "Ein Held tötet dich besonders oft", detail: "Mehr als ein Viertel deiner Tode geht auf denselben Helden. Lerne dessen Fähigkeiten und halte Abstand, wenn sie bereit sind." });

  if (r.aim) {
    const ref = r.aim.topAccuracy ?? r.aim.lobbyAccuracy;
    if (r.aim.accuracy !== null && ref && r.aim.accuracy < ref - 0.04) out.push({ id: "aim", severity: "high", title: "Trefferquote unter den Besten", detail: `Du triffst ${Math.round(r.aim.accuracy * 100)} % deiner Schüsse, die Besten deiner Lobbys ${Math.round(ref * 100)} %. Kurze Salven und Zielen auf Kopfhöhe verbessern das schnell.`, drill: "aim" });
    const hh = r.aim.topHeroHit ?? r.aim.lobbyHeroHit;
    if (r.aim.heroHit !== null && hh && r.aim.heroHit < hh - 0.05) out.push({ id: "hero-hit", severity: "mid", title: "Zu viele Schüsse gehen auf Creeps", detail: `Nur ${Math.round(r.aim.heroHit * 100)} % deiner Treffer landen auf Helden (Referenz ${Math.round(hh * 100)} %). Priorisiere Helden im Kampf.`, drill: "aim" });
    const cr = r.aim.topCrit ?? r.aim.lobbyCrit;
    if (r.aim.crit !== null && cr && r.aim.crit < cr - 0.03) out.push({ id: "crit", severity: "mid", title: "Wenige Kopftreffer", detail: `${Math.round(r.aim.crit * 100)} % Kopftreffer gegenüber ${Math.round(cr * 100)} % bei den Besten. Halte das Fadenkreuz auf Kopfhöhe, statt auf den Körper zu zielen.`, drill: "aim" });
  }

  const order = { high: 0, mid: 1, good: 2 } as const;
  out.sort((a, b) => order[a.severity] - order[b.severity]);
  if (!out.some((f) => f.severity !== "good")) out.unshift({ id: "solid", severity: "good", title: "Keine großen Schwächen erkennbar", detail: "Deine Werte liegen nah an der Referenz. Setze dir ein konkretes Ziel, um dich weiter zu steigern." });
  return out;
}

/** Fortschritt eines Ziels: gezählt werden die letzten `window` Matches nach Erstellung. */
export function goalProgress(goal: Goal, metrics: MetricValue[]): { hits: number; played: number; done: boolean; pctDone: number; unknown: boolean } {
  const m = metrics.find((x) => x.id === goal.metric);
  if (!m) return { hits: 0, played: 0, done: false, pctDone: 0, unknown: true };
  const vals = m.values.filter((v) => v.value !== null && v.at >= goal.createdAt).slice(-goal.window);
  const hits = vals.filter((v) => (goal.lowerIsBetter ? (v.value as number) <= goal.target : (v.value as number) >= goal.target)).length;
  return { hits, played: vals.length, done: hits >= goal.needed, pctDone: Math.min(1, hits / goal.needed), unknown: false };
}
