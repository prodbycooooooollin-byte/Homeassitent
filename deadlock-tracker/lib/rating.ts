import type { Grade, MatchDetails, MatchPlayer, Rating } from "./types";

const GRADE_STEPS: [number, Grade][] = [
  [1.45, "S"],
  [1.2, "A"],
  [0.95, "B"],
  [0.75, "C"],
  [0.55, "D"],
  [-Infinity, "F"],
];

export function gradeFor(score: number): Grade {
  for (const [min, g] of GRADE_STEPS) if (score >= min) return g;
  return "F";
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Wert relativ zum Lobby-Durchschnitt (1.0 = Durchschnitt), begrenzt auf 0..2.5. */
function rel(value: number, avg: number): number {
  if (avg <= 0) return 1;
  return clamp(value / avg, 0, 2.5);
}

/**
 * Performance-Rating eines Spielers relativ zur gesamten Lobby (12 Spieler).
 * Heuristik: gewichteter Mittelwert normalisierter Kennzahlen, 1.0 = Lobby-Schnitt.
 * Zusätzlich +/-0.05 für Sieg/Niederlage; Abbrecher bekommen ein F.
 */
export function ratePlayer(match: MatchDetails, accountId: number): Rating | null {
  const me = match.players.find((p) => p.accountId === accountId);
  if (!me || match.players.length < 2) return null;
  const minutes = Math.max(1, match.durationS / 60);
  const teamKills = (team: number) =>
    match.players.filter((p) => p.team === team).reduce((a, p) => a + p.kills, 0);

  const kda = (p: MatchPlayer) => (p.kills + p.assists) / Math.max(1, p.deaths);
  const kp = (p: MatchPlayer) => (p.kills + p.assists) / Math.max(1, teamKills(p.team));
  const souls = (p: MatchPlayer) => p.netWorth / minutes;
  const dmg = (p: MatchPlayer) => p.heroDamage / minutes;
  const heal = (p: MatchPlayer) => p.healing / minutes;
  const obj = (p: MatchPlayer) => p.objectiveDamage / minutes;

  const all = match.players;
  const avg = {
    kda: mean(all.map(kda)),
    kp: mean(all.map(kp)),
    souls: mean(all.map(souls)),
    dmg: mean(all.map(dmg)),
    heal: mean(all.map(heal)),
    obj: mean(all.map(obj)),
  };

  // Schaden und Heilung zählen als "Impact": wer heilt statt zu schießen, wird nicht bestraft.
  const impact = Math.max(rel(dmg(me), avg.dmg), rel(heal(me), avg.heal) * 0.85);

  const parts = [
    { label: "KDA", value: rel(kda(me), avg.kda), weight: 0.25 },
    { label: "Kill-Beteiligung", value: rel(kp(me), avg.kp), weight: 0.15 },
    { label: "Souls/Min", value: rel(souls(me), avg.souls), weight: 0.2 },
    { label: "Schaden/Heilung", value: impact, weight: 0.3 },
    { label: "Objective-Schaden", value: rel(obj(me), avg.obj), weight: 0.1 },
  ];
  let score = parts.reduce((a, p) => a + p.value * p.weight, 0);
  const won = match.winningTeam !== null && match.winningTeam === me.team;
  if (match.winningTeam !== null) score += won ? 0.05 : -0.05;

  const grade: Grade = me.abandoned ? "F" : gradeFor(score);
  return { grade, score: Math.round(score * 100) / 100, parts };
}
