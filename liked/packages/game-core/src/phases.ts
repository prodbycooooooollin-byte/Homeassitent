import type { Phase } from '@liked/protocol';

/**
 * Explizite Zustandsmaschine der Partie.
 * LOBBY → PREPARING → COUNTDOWN → PLAYING_AND_VOTING → REVEAL → SCOREBOARD
 * SCOREBOARD → PREPARING | RESULTS
 * Annullierung/Ersatz: PREPARING|COUNTDOWN|PLAYING_AND_VOTING → PREPARING
 * Abbruch: jede laufende Phase → RESULTS (abgeschlossene Blöcke) oder LOBBY (kein Block fertig)
 */
const TRANSITIONS: Record<Phase, readonly Phase[]> = {
  LOBBY: ['PREPARING'],
  PREPARING: ['COUNTDOWN', 'PREPARING', 'RESULTS', 'LOBBY'],
  COUNTDOWN: ['PLAYING_AND_VOTING', 'PREPARING', 'RESULTS', 'LOBBY'],
  PLAYING_AND_VOTING: ['REVEAL', 'PREPARING', 'RESULTS', 'LOBBY'],
  REVEAL: ['SCOREBOARD', 'RESULTS', 'LOBBY'],
  SCOREBOARD: ['PREPARING', 'RESULTS', 'LOBBY'],
  RESULTS: ['LOBBY']
};

export function canTransition(from: Phase, to: Phase): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: Phase, to: Phase): void {
  if (!canTransition(from, to)) throw new Error(`Ungültiger Phasenwechsel ${from} → ${to}`);
}

export function isInMatch(phase: Phase): boolean {
  return phase !== 'LOBBY' && phase !== 'RESULTS';
}
