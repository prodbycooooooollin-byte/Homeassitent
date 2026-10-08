/** Reine Berechnung für den Counter-Picker (keine Netzwerk- oder UI-Abhängigkeiten). */
export interface MatchupRow { heroId: number; matches: number; wins: number }
export interface OwnStat { heroId: number; matches: number; wins: number; avgScore?: number | null }

/** Matchup-Daten aus Sicht des GEGNERS: matchups[gegnerId] = Zeilen "Gegner gegen Held X" (wins = Siege des Gegners). */
export type EnemyMatchups = Record<number, MatchupRow[]>;

export interface Pick {
  heroId: number;
  /** Gesamt-Score 0-100 */
  score: number;
  /** Mittlere (geglättete) Matchup-Winrate gegen die Auswahl, 0-1; null = keine Daten */
  matchup: number | null;
  /** Einzelwerte je Gegner (Winrate des Kandidaten), 0-1 */
  vs: { enemyId: number; wr: number; matches: number }[];
  ownMatches: number;
  /** Eigene Roh-Winrate 0-1; null = nie gespielt */
  ownWr: number | null;
  isNew: boolean;
}

export const MIN_MATCHUP_SAMPLE = 40;
export const NEW_THRESHOLD = 3;
const PRIOR = 20; // Pseudo-Matches Richtung 50 %

const smooth = (wins: number, matches: number, prior = PRIOR) => (wins + prior / 2) / (matches + prior);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Winrate von `heroId` gegen `enemyId` (aus der Perspektive des Gegners umgerechnet). */
export function winrateVs(heroId: number, enemyId: number, matchups: EnemyMatchups): { wr: number; matches: number } | null {
  const row = matchups[enemyId]?.find((r) => r.heroId === heroId);
  if (!row || row.matches < MIN_MATCHUP_SAMPLE) return null;
  return { wr: 1 - smooth(row.wins, row.matches), matches: row.matches };
}

/** Eigene Erfahrung: Gewicht wächst mit der Anzahl Spiele (max. 40 % bei 12+ Spielen). */
export const ownWeight = (matches: number) => 0.4 * Math.min(1, matches / 12);

export function scoreHero(heroId: number, enemies: number[], matchups: EnemyMatchups, own?: OwnStat): Pick {
  const vs = enemies.flatMap((enemyId) => { const r = winrateVs(heroId, enemyId, matchups); return r ? [{ enemyId, ...r }] : []; });
  const matchup = vs.length ? vs.reduce((s, v) => s + v.wr, 0) / vs.length : null;
  const ownMatches = own?.matches ?? 0;
  const ownWr = ownMatches > 0 && own ? own.wins / ownMatches : null;
  const ownSmooth = own && ownMatches > 0 ? smooth(own.wins, ownMatches, 4) : 0.5;
  const w = ownWeight(ownMatches);
  const combined = (1 - w) * (matchup ?? 0.5) + w * ownSmooth;
  return { heroId, score: Math.round(clamp(50 + (combined - 0.5) * 500, 0, 100)), matchup, vs, ownMatches, ownWr, isNew: ownMatches < NEW_THRESHOLD };
}

export interface CounterResult { picks: Pick[]; avoid: Pick[] }

/** Rangliste aller Kandidaten (ohne die gewählten Gegner) + die 3 schlechtesten Matchups. */
export function rankCounters(candidates: number[], enemies: number[], matchups: EnemyMatchups, own: OwnStat[]): CounterResult {
  const ownMap = new Map(own.map((o) => [o.heroId, o]));
  const all = candidates.filter((c) => !enemies.includes(c)).map((c) => scoreHero(c, enemies, matchups, ownMap.get(c)));
  const picks = [...all].sort((a, b) => b.score - a.score || b.ownMatches - a.ownMatches);
  const avoid = all.filter((p) => p.matchup !== null).sort((a, b) => (a.matchup as number) - (b.matchup as number)).slice(0, 3);
  return { picks, avoid };
}

const joinNames = (n: string[]) => (n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} und ${n[n.length - 1]}`);
const pct = (v: number) => `${Math.round(v * 100)} %`;

/** Kurze Begründung auf Deutsch. */
export function reasonFor(p: Pick, nameOf: (id: number) => string): string {
  const parts: string[] = [];
  const good = p.vs.filter((v) => v.wr >= 0.5).sort((a, b) => b.wr - a.wr).slice(0, 2);
  if (good.length) parts.push(`gewinnt ${pct(good.reduce((s, v) => s + v.wr, 0) / good.length)} gegen ${joinNames(good.map((v) => nameOf(v.enemyId)))}`);
  else if (p.vs.length) { const w = [...p.vs].sort((a, b) => a.wr - b.wr)[0]; parts.push(`schwächer gegen ${nameOf(w.enemyId)} (${pct(w.wr)})`); }
  else parts.push("keine Matchup-Daten");
  parts.push(p.ownMatches === 0 ? "du hast ihn noch nie gespielt" : `du hast ${p.ownMatches} ${p.ownMatches === 1 ? "Spiel" : "Spiele"}`);
  return parts.join(", ");
}
