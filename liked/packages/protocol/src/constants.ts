/** Zentrale Spielkonstanten. Server und Client lesen dieselben Werte. */
export const PROTOCOL_VERSION = 1;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

export const CLIPS_PER_PERSON_OPTIONS = [5, 8, 10] as const;
export const ANSWER_SECONDS_OPTIONS = [15, 20, 30] as const;
export const DEFAULT_CLIPS_PER_PERSON = 5;
export const DEFAULT_ANSWER_SECONDS = 20;

/** Ersatzkandidaten pro Person zusätzlich zu den gewerteten Clips. */
export const SPARE_CLIPS_PER_PERSON = 3;
/** Obergrenze der Kandidaten, die ein Client für eine Partie übermittelt. */
export const MAX_CANDIDATES = 60;
/** Obergrenze der gesalzenen Index-Hashes zur Überschneidungsprüfung. */
export const MAX_INDEX_HASHES = 3000;

export const RECONNECT_WINDOW_MS = 30_000;
export const TIME_GROUP_MS = 80;

/** Phasendauern in Millisekunden. */
export const TIMINGS = {
  preparingTimeoutMs: 12_000,
  preparingRetryMs: 8_000,
  countdownMs: 3_000,
  /** Nach der letzten gültigen Stimme läuft die Runde noch so lange. */
  allVotedGraceMs: 1_200,
  revealMs: 7_000,
  scoreboardMs: 5_000,
  maxHostPauseMs: 120_000,
  /** Spielstart-Abweichung, ab der eine Runde neutral annulliert wird. */
  maxStartDelayMs: 2_500,
  /** Zusammenhängendes Buffering, ab dem eine Runde annulliert wird. */
  maxBufferingMs: 3_000,
  /** Kurze Schwankungen unterhalb dieser Summe werden ignoriert. */
  maxTotalBufferingMs: 5_000,
  roomIdleTtlMs: 30 * 60_000,
  resultsTtlMs: 30 * 60_000
} as const;

/** Wie oft pro Partie Clips insgesamt ersetzt werden dürfen, bevor abgebrochen wird. */
export const MAX_REPLACEMENTS_PER_PLAYER = 3;

export const REACTION_EMOJIS = ['🔥', '😂', '😱', '👀', '💜', '👏'] as const;

export const AVATARS = [
  'fox', 'owl', 'cat', 'frog', 'panda', 'tiger', 'koala', 'octopus',
  'unicorn', 'alien', 'robot', 'ghost', 'penguin', 'dragon', 'bee', 'shark'
] as const;

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export const PHASES = [
  'LOBBY',
  'PREPARING',
  'COUNTDOWN',
  'PLAYING_AND_VOTING',
  'REVEAL',
  'SCOREBOARD',
  'RESULTS'
] as const;
