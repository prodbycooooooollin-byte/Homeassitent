import { MIN_PLAYERS, TIMINGS } from '@liked/protocol';

/**
 * Rundenzahl einer Partie: Jede Person steuert `clipsPerPerson` Clips bei, also
 * Runden = Spielerzahl × Clips pro Person. Solange weniger als die Mindestzahl im Raum
 * ist, wird mit der Mindestzahl gerechnet – und das auch so benannt.
 */
export function roundsInfo(activePlayers: number, clipsPerPerson: number): { players: number; rounds: number; basedOnMinimum: boolean } {
  const basedOnMinimum = activePlayers < MIN_PLAYERS;
  const players = basedOnMinimum ? MIN_PLAYERS : activePlayers;
  return { players, rounds: players * clipsPerPerson, basedOnMinimum };
}

/**
 * Geschätzte Spieldauer in Minuten (Spanne). Pro Runde: Laden (~2–4 s), Countdown,
 * Antwortphase (endet früher, wenn alle getippt haben), Auflösung und Zwischenstand.
 */
export function estimateMinutes(rounds: number, answerSeconds: number, t: Pick<typeof TIMINGS, 'countdownMs' | 'revealMs' | 'scoreboardMs' | 'allVotedGraceMs'> = TIMINGS): { min: number; max: number } {
  const fixed = (t.countdownMs + t.revealMs + t.scoreboardMs) / 1000;
  const fast = 2 + fixed + answerSeconds * 0.4 + t.allVotedGraceMs / 1000;
  const slow = 4 + fixed + answerSeconds;
  return { min: Math.max(1, Math.round((rounds * fast) / 60)), max: Math.max(1, Math.round((rounds * slow) / 60)) };
}
