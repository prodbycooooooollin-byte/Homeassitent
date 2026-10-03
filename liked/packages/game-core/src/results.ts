import type { ScoreEntry, Title } from '@liked/protocol';

export interface PlayerStats {
  score: number;
  correct: number;
  opportunities: number;
  streak: number;
  longestStreak: number;
  firstCorrect: number;
}

export function emptyStats(): PlayerStats {
  return { score: 0, correct: 0, opportunities: 0, streak: 0, longestStreak: 0, firstCorrect: 0 };
}

/**
 * Rangliste: zuerst Punkte, dann Anzahl richtiger Antworten. Bei Gleichstand in
 * beidem wird der Platz geteilt. Kein zufälliger Tiebreaker.
 * Bei gleichen Werten wird für die Anzeige stabil nach `order` sortiert.
 */
export function standings(stats: ReadonlyMap<string, PlayerStats>, order: readonly string[]): ScoreEntry[] {
  const entries = order
    .filter((id) => stats.has(id))
    .map((id) => ({ id, s: stats.get(id)! }));
  entries.sort((a, b) => b.s.score - a.s.score || b.s.correct - a.s.correct);
  return entries.map(({ id, s }) => {
    const better = entries.filter(
      (e) => e.s.score > s.score || (e.s.score === s.score && e.s.correct > s.correct)
    ).length;
    return {
      playerId: id,
      score: s.score,
      correct: s.correct,
      opportunities: s.opportunities,
      streak: s.streak,
      longestStreak: s.longestStreak,
      firstCorrect: s.firstCorrect,
      place: better + 1
    };
  });
}

/** Titel nur bei eindeutigem Spitzenwert – keine Zufallsvergabe. */
export function awardTitles(stats: ReadonlyMap<string, PlayerStats>): Title[] {
  const titles: Title[] = [];
  const unique = (pick: (s: PlayerStats) => number, min: number): string | null => {
    let bestId: string | null = null;
    let best = -Infinity;
    let tie = false;
    for (const [id, s] of stats) {
      const v = pick(s);
      if (v > best) {
        best = v;
        bestId = id;
        tie = false;
      } else if (v === best) tie = true;
    }
    return !tie && best >= min ? bestId : null;
  };
  const mk = unique((s) => s.correct, 1);
  if (mk) titles.push({ id: 'menschenkenner', playerId: mk });
  const br = unique((s) => s.firstCorrect, 1);
  if (br) titles.push({ id: 'blitzrater', playerId: br });
  const st = unique((s) => s.longestStreak, 3);
  if (st) titles.push({ id: 'serientaeter', playerId: st });
  return titles;
}
