import type { ClipRef, RoomMode, RoomSettings } from './schemas.js';
import type { PHASES } from './constants.js';

export type Phase = (typeof PHASES)[number];

export type PoolStatus = 'missing' | 'insufficient' | 'ok';

/** Öffentliche Spielerdaten – für alle im Raum sichtbar. */
export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  mediaChecked: boolean;
  /** Nur Status, niemals die Clips selbst. */
  poolStatus: PoolStatus;
  /** Wartet auf die nächste Lobby (während einer laufenden Partie beigetreten). */
  waiting: boolean;
}

export type RoundRole = 'voter' | 'owner' | 'spectator';

export interface OwnVote {
  targetId: string;
  voteId: string;
  /** Nur true, wenn der Server die Stimme verbindlich angenommen hat. */
  confirmed: true;
}

/**
 * Rundenansicht vor der Auflösung. Enthält weder Besitzer noch Lösung;
 * `you.role === 'owner'` bekommt ausschließlich der Besitzer selbst.
 */
export interface RoundView {
  roundId: string;
  clip: ClipRef;
  /** Serverzeit (ms), zu der alle gemeinsam starten. */
  startAt: number;
  /** Serverzeit (ms), bis zu der Stimmen angenommen werden. */
  deadline: number;
  answerSeconds: number;
  /** Antwortmöglichkeiten in fester Reihenfolge (ohne einen selbst). */
  answerOptions: string[];
  you: { role: RoundRole; vote: OwnVote | null };
  /** Anzahl eingegangener Stimmen – ohne Personenbezug. */
  votesIn: number;
  votersTotal: number;
  /** Ladeversuch (für Retry vor dem Start). */
  loadAttempt: number;
}

export interface RevealVote {
  voterId: string;
  targetId: string | null;
  correct: boolean;
  rank: number | null;
  basePoints: number;
  multiplier: number;
  points: number;
  streak: number;
}

export interface RevealView {
  roundId: string;
  clip: ClipRef;
  ownerId: string;
  votes: RevealVote[];
}

export interface ScoreEntry {
  playerId: string;
  score: number;
  correct: number;
  opportunities: number;
  streak: number;
  longestStreak: number;
  firstCorrect: number;
  /** Geteilte Plätze möglich. */
  place: number;
}

export interface Title {
  id: 'menschenkenner' | 'blitzrater' | 'serientaeter';
  playerId: string;
}

export interface ResultsView {
  standings: ScoreEntry[];
  titles: Title[];
  completedBlocks: number;
  plannedBlocks: number;
  /** Grund, falls die Partie vorzeitig ausgewertet wurde. */
  endReason: 'complete' | 'player_left' | 'pool_exhausted';
}

export type NoticeKind =
  | 'round_voided'
  | 'clip_replaced'
  | 'match_aborted'
  | 'host_changed'
  | 'player_left'
  | 'rolled_back';

export interface Notice {
  key: string;
  kind: NoticeKind;
  /** Optionaler Parameter (z. B. Name). Texte liegen im Client. */
  param?: string;
}

export interface RoomView {
  roomId: string;
  code: string;
  version: number;
  mode: RoomMode;
  phase: Phase;
  /** Serverzeit (ms), zu der die aktuelle Phase planmäßig endet. */
  phaseEndsAt: number | null;
  paused: boolean;
  settings: RoomSettings;
  youId: string;
  hostId: string;
  players: PublicPlayer[];
  /** Punktestand (ab Partiestart). */
  scores: ScoreEntry[];
  roundNumber: number;
  totalRounds: number;
  blockIndex: number;
  totalBlocks: number;
  round: RoundView | null;
  reveal: RevealView | null;
  results: ResultsView | null;
  notices: Notice[];
  /** Verständlicher Grund, warum noch nicht gestartet werden kann. */
  startBlockers: StartBlocker[];
}

export type StartBlocker =
  | { kind: 'too_few_players'; have: number; need: number }
  | { kind: 'not_ready'; playerIds: string[] }
  | { kind: 'pool_missing'; playerIds: string[] }
  | { kind: 'pool_insufficient'; playerIds: string[]; need: number }
  | { kind: 'media_unchecked'; playerIds: string[] }
  | { kind: 'disconnected'; playerIds: string[] };

export interface Reaction {
  id: string;
  playerId: string;
  emoji: string;
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode };

export type ErrorCode =
  | 'invalid_payload'
  | 'rate_limited'
  | 'room_not_found'
  | 'room_full'
  | 'room_limit'
  | 'wrong_phase'
  | 'not_host'
  | 'not_in_room'
  | 'invalid_token'
  | 'protocol_mismatch'
  | 'mode_mismatch'
  | 'round_mismatch'
  | 'not_eligible'
  | 'invalid_target'
  | 'too_late'
  | 'already_voted'
  | 'cannot_start';

export interface JoinResult {
  roomCode: string;
  playerId: string;
  token: string;
  /** Salz für die Index-Hashes dieses Raums. */
  indexSalt: string;
}

export interface VoteResult {
  vote: OwnVote;
}

export interface TimeSyncResult {
  t0: number;
  serverTime: number;
}

export interface S2CEvents {
  'room:state': (view: RoomView) => void;
  'room:reaction': (reaction: Reaction) => void;
  'room:kicked': (info: { reason: 'kicked' | 'room_closed' }) => void;
}
