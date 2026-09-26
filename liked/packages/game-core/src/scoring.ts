import { TIME_GROUP_MS } from '@liked/protocol';

/**
 * Basispunkte für einen richtigen Tipp.
 * m = Abstimmungsberechtigte zu Rundenbeginn, r = Rang unter den richtigen Tipps (ab 1).
 *   basePoints = round(1000 - 300 * (r - 1) / (m - 1))
 */
export function basePoints(rank: number, eligibleVoters: number): number {
  if (!Number.isInteger(rank) || rank < 1) throw new Error('rank muss >= 1 sein');
  if (eligibleVoters <= 1) return 1000;
  const r = Math.min(rank, eligibleVoters);
  return Math.round(1000 - (300 * (r - 1)) / (eligibleVoters - 1));
}

/** Multiplikator in Prozent (ganzzahlig, um Rundungsfehler zu vermeiden). */
export function streakMultiplierPercent(streakIncludingThisHit: number): number {
  if (streakIncludingThisHit <= 1) return 100;
  if (streakIncludingThisHit === 2) return 105;
  if (streakIncludingThisHit === 3) return 110;
  return 115;
}

export function roundPoints(base: number, streakIncludingThisHit: number): number {
  // base * pct ist ganzzahlig → exakte Halbwerte, Math.round rundet .5 auf.
  return Math.round((base * streakMultiplierPercent(streakIncludingThisHit)) / 100);
}

export interface TimedVote {
  voterId: string;
  targetId: string;
  /** Servereingang in ms relativ zum Rundenstart. */
  elapsedMs: number;
}

/**
 * Rangvergabe ausschließlich unter richtigen Tipps.
 * Zeitgruppen à `groupMs` (Standard 80 ms, relativ zum Rundenstart): gleiche Gruppe
 * = gleicher Rang; Rang einer Gruppe = 1 + Anzahl richtiger Tipps in früheren Gruppen.
 * Falsche Tipps werden vorher entfernt und beeinflussen den Rang nicht.
 */
export function rankCorrectVotes(
  votes: readonly TimedVote[],
  ownerId: string,
  groupMs: number = TIME_GROUP_MS
): Map<string, number> {
  const correct = votes
    .filter((v) => v.targetId === ownerId)
    .map((v) => ({ voterId: v.voterId, group: Math.floor(Math.max(0, v.elapsedMs) / groupMs) }))
    .sort((a, b) => a.group - b.group);
  const ranks = new Map<string, number>();
  let earlier = 0;
  let i = 0;
  while (i < correct.length) {
    const group = correct[i]!.group;
    let j = i;
    while (j < correct.length && correct[j]!.group === group) j++;
    for (let k = i; k < j; k++) ranks.set(correct[k]!.voterId, earlier + 1);
    earlier += j - i;
    i = j;
  }
  return ranks;
}

export interface VoterOutcome {
  voterId: string;
  targetId: string | null;
  correct: boolean;
  rank: number | null;
  basePoints: number;
  multiplierPercent: number;
  points: number;
  /** Streak nach dieser Runde. */
  streak: number;
}

/**
 * Wertet eine reguläre Runde aus. Eigener Clip: Besitzer ist nicht in `eligible`
 * und seine Streak bleibt unverändert (wird hier nicht angefasst).
 */
export function scoreRound(params: {
  ownerId: string;
  eligible: readonly string[];
  votes: readonly TimedVote[];
  streaks: ReadonlyMap<string, number>;
  groupMs?: number;
}): VoterOutcome[] {
  const { ownerId, eligible, votes, streaks } = params;
  const eligibleSet = new Set(eligible);
  const validVotes = votes.filter((v) => eligibleSet.has(v.voterId) && v.voterId !== ownerId);
  const ranks = rankCorrectVotes(validVotes, ownerId, params.groupMs);
  const m = eligible.length;
  return eligible.map((voterId) => {
    const vote = validVotes.find((v) => v.voterId === voterId) ?? null;
    const rank = ranks.get(voterId) ?? null;
    if (vote && rank !== null) {
      const streak = (streaks.get(voterId) ?? 0) + 1;
      const base = basePoints(rank, m);
      return {
        voterId,
        targetId: vote.targetId,
        correct: true,
        rank,
        basePoints: base,
        multiplierPercent: streakMultiplierPercent(streak),
        points: roundPoints(base, streak),
        streak
      };
    }
    return {
      voterId,
      targetId: vote?.targetId ?? null,
      correct: false,
      rank: null,
      basePoints: 0,
      multiplierPercent: 100,
      points: 0,
      streak: 0
    };
  });
}
