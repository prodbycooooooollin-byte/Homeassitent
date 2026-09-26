import { TIMINGS } from './protocol.ts';

/**
 * Grobe Schätzung der Partiedauer. Ausdrücklich eine Schätzung: Hinweise werden oft
 * vor Ablauf der Zugzeit abgegeben, Abstimmungen können früher beginnen und der
 * Impostor kann das Spiel durch Raten sofort beenden.
 */
export interface DurationEstimate {
  /** null = ohne Zugtimer nicht seriös schätzbar */
  minMinutes: number | null;
  maxMinutes: number | null;
  label: string;
}

/** Durchschnittliche tatsächliche Zeit pro Zug, wenn Hinweise zügig kommen. */
const QUICK_TURN_S = 10;
/** Rollen ansehen (typisch) */
const ROLE_S = 20;

export function estimateDuration(players: number, rounds: number, turnSeconds: number): DurationEstimate {
  const p = Math.max(3, players);
  if (!turnSeconds) {
    return { minMinutes: null, maxMinutes: null, label: 'offen – ohne Zugtimer bestimmt ihr das Tempo' };
  }
  const fixed = ROLE_S + TIMINGS.discussionMs / 1000 + TIMINGS.votingMs / 1000;
  const turns = p * rounds;
  const low = fixed + turns * Math.min(turnSeconds, QUICK_TURN_S);
  const high = fixed + turns * turnSeconds;
  const minM = Math.max(1, Math.round(low / 60));
  const maxM = Math.max(minM, Math.round(high / 60));
  return {
    minMinutes: minM,
    maxMinutes: maxM,
    label: minM === maxM ? `ca. ${minM} Min.` : `ca. ${minM}–${maxM} Min.`,
  };
}
