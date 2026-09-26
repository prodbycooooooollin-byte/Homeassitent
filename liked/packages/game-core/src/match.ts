import type { ClipRef, ErrorCode } from '@liked/protocol';
import { emptyStats, standings, awardTitles, type PlayerStats } from './results.js';
import { scoreRound, type TimedVote, type VoterOutcome } from './scoring.js';
import { shuffle, type Rng } from './rng.js';

export interface MatchConfig {
  players: readonly string[];
  clipsPerPerson: number;
  /** Gezogene Clips je Besitzer (gewertete zuerst, danach Ersatz). */
  queues: ReadonlyMap<string, readonly ClipRef[]>;
  rng: Rng;
  maxReplacements: number;
}

export interface ActiveRound {
  roundId: string;
  ownerId: string;
  clip: ClipRef;
  eligible: string[];
  startAt: number;
  deadline: number;
  votes: Map<string, { targetId: string; voteId: string; receivedAt: number }>;
  status: 'open' | 'scored' | 'voided';
  outcomes: VoterOutcome[] | null;
}

export type NextClip =
  | { kind: 'clip'; ownerId: string; clip: ClipRef }
  | { kind: 'done' }
  | { kind: 'exhausted'; ownerId: string }
  | { kind: 'too_many_replacements' };

export type VoteOutcome =
  | { ok: true; duplicate: boolean; targetId: string; voteId: string }
  | { ok: false; error: ErrorCode };

const cloneStats = (m: ReadonlyMap<string, PlayerStats>) =>
  new Map([...m].map(([k, v]) => [k, { ...v }] as const));

/**
 * Reine Partielogik ohne Timer und Netzwerk. Der Server ruft die Methoden in
 * der von der Zustandsmaschine erlaubten Reihenfolge auf.
 */
export class MatchEngine {
  readonly players: readonly string[];
  readonly totalBlocks: number;
  blockIndex = -1;
  completedBlocks = 0;
  replacements = 0;
  current: ActiveRound | null = null;
  stats: Map<string, PlayerStats>;
  /** Alle gezeigten oder versuchten Clip-IDs dieser Partie (keine Wiederholung). */
  readonly usedClipIds = new Set<string>();

  private blockRemaining: string[] = [];
  private lastOwner: string | null = null;
  private snapshot: Map<string, PlayerStats>;
  private readonly queues: Map<string, ClipRef[]>;
  private readonly rng: Rng;
  private readonly maxReplacements: number;

  constructor(cfg: MatchConfig) {
    if (cfg.players.length < 2) throw new Error('Zu wenige Spieler');
    this.players = [...cfg.players];
    this.totalBlocks = cfg.clipsPerPerson;
    this.rng = cfg.rng;
    this.maxReplacements = cfg.maxReplacements;
    this.queues = new Map(this.players.map((p) => [p, [...(cfg.queues.get(p) ?? [])]]));
    this.stats = new Map(this.players.map((p) => [p, emptyStats()]));
    this.snapshot = cloneStats(this.stats);
  }

  get totalRounds(): number {
    return this.totalBlocks * this.players.length;
  }

  /** Anzahl gewerteter (nicht annullierter) Runden. */
  scoredRounds = 0;

  /** Laufende Rundennummer (1-basiert) während einer offenen Runde, sonst Anzahl gewerteter Runden. */
  get roundNumber(): number {
    return this.current?.status === 'open' ? this.scoredRounds + 1 : this.scoredRounds;
  }

  get isComplete(): boolean {
    return this.completedBlocks >= this.totalBlocks;
  }

  /** Nächster Clip gemäß Blockplanung. Ein Block enthält genau einen Clip je Person. */
  nextClip(): NextClip {
    if (this.current?.status === 'open') throw new Error('Runde läuft noch');
    if (this.replacements > this.maxReplacements) return { kind: 'too_many_replacements' };
    if (this.blockRemaining.length === 0) {
      if (this.blockIndex + 1 >= this.totalBlocks) return { kind: 'done' };
      this.blockIndex++;
      this.snapshot = cloneStats(this.stats);
      this.blockRemaining = this.orderBlock();
    }
    const ownerId = this.blockRemaining[0]!;
    const queue = this.queues.get(ownerId)!;
    let clip = queue.shift();
    while (clip && this.usedClipIds.has(clip.videoId)) clip = queue.shift();
    if (!clip) return { kind: 'exhausted', ownerId };
    this.usedClipIds.add(clip.videoId);
    return { kind: 'clip', ownerId, clip };
  }

  /** Reihenfolge im Block mischen; gleicher Besitzer nicht direkt hintereinander. */
  private orderBlock(): string[] {
    const order = shuffle(this.players, this.rng);
    if (order.length > 1 && order[0] === this.lastOwner) {
      const j = 1 + Math.floor(this.rng() * (order.length - 1));
      [order[0], order[j]] = [order[j]!, order[0]!];
    }
    return order;
  }

  remainingClips(ownerId: string): number {
    return (this.queues.get(ownerId) ?? []).filter((c) => !this.usedClipIds.has(c.videoId)).length;
  }

  beginRound(r: { roundId: string; ownerId: string; clip: ClipRef; startAt: number; deadline: number }): ActiveRound {
    if (this.blockRemaining[0] !== r.ownerId) throw new Error('Besitzer passt nicht zur Blockplanung');
    this.current = {
      ...r,
      eligible: this.players.filter((p) => p !== r.ownerId),
      votes: new Map(),
      status: 'open',
      outcomes: null
    };
    return this.current;
  }

  /** Verschiebt Start und Frist (z. B. nach erfolgreichem Laden aller Clients). */
  reschedule(roundId: string, startAt: number, deadline: number): void {
    if (!this.current || this.current.roundId !== roundId || this.current.status !== 'open') return;
    this.current.startAt = startAt;
    this.current.deadline = deadline;
  }

  recordVote(voterId: string, roundId: string, targetId: string, voteId: string, receivedAt: number): VoteOutcome {
    const r = this.current;
    if (!r || r.roundId !== roundId) return { ok: false, error: 'round_mismatch' };
    const existing = r.votes.get(voterId);
    if (existing) {
      // Idempotent: derselbe oder ein neuer Versuch ändert die verbindliche Stimme nie.
      return { ok: true, duplicate: true, targetId: existing.targetId, voteId: existing.voteId };
    }
    if (r.status !== 'open') return { ok: false, error: 'too_late' };
    if (!r.eligible.includes(voterId)) return { ok: false, error: 'not_eligible' };
    if (receivedAt < r.startAt) return { ok: false, error: 'wrong_phase' };
    if (receivedAt > r.deadline) return { ok: false, error: 'too_late' };
    if (targetId === voterId || !this.players.includes(targetId)) return { ok: false, error: 'invalid_target' };
    r.votes.set(voterId, { targetId, voteId, receivedAt });
    return { ok: true, duplicate: false, targetId, voteId };
  }

  allEligibleVoted(): boolean {
    const r = this.current;
    return !!r && r.eligible.every((p) => r.votes.has(p));
  }

  /** Wertet die offene Runde genau einmal aus. Weitere Aufrufe liefern das gleiche Ergebnis. */
  finishRound(): VoterOutcome[] {
    const r = this.current;
    if (!r) throw new Error('Keine Runde');
    if (r.status === 'scored') return r.outcomes!;
    if (r.status === 'voided') throw new Error('Runde wurde annulliert');
    const votes: TimedVote[] = [...r.votes].map(([voterId, v]) => ({
      voterId,
      targetId: v.targetId,
      elapsedMs: v.receivedAt - r.startAt
    }));
    const streaks = new Map([...this.stats].map(([id, s]) => [id, s.streak]));
    const outcomes = scoreRound({ ownerId: r.ownerId, eligible: r.eligible, votes, streaks });
    for (const o of outcomes) {
      const s = this.stats.get(o.voterId)!;
      s.opportunities++;
      s.streak = o.streak;
      s.longestStreak = Math.max(s.longestStreak, o.streak);
      if (o.correct) {
        s.correct++;
        s.score += o.points;
        if (o.rank === 1) s.firstCorrect++;
      }
    }
    r.status = 'scored';
    r.outcomes = outcomes;
    this.scoredRounds++;
    this.blockRemaining.shift();
    this.lastOwner = r.ownerId;
    if (this.blockRemaining.length === 0) this.completedBlocks = this.blockIndex + 1;
    return outcomes;
  }

  /**
   * Neutrale Annullierung: keine Punkte, keine Streak-Änderung, Clip wird nicht
   * erneut verwendet. Der nächste Clip kommt vom selben Besitzer.
   */
  voidRound(): void {
    if (this.current && this.current.status === 'open') this.current.status = 'voided';
    this.replacements++;
  }

  /** Ersatz vor dem Start (Clip konnte nicht geladen werden). */
  replaceBeforeStart(): void {
    this.voidRound();
  }

  /** Setzt den laufenden, unvollständigen Block inklusive Streaks vollständig zurück. */
  rollbackIncompleteBlock(): { rolledBack: boolean } {
    const incomplete = this.blockIndex >= 0 && this.completedBlocks < this.blockIndex + 1;
    if (this.current?.status === 'open') this.current.status = 'voided';
    if (incomplete) {
      this.stats = cloneStats(this.snapshot);
      this.blockRemaining = [];
      this.blockIndex = this.completedBlocks - 1;
      this.scoredRounds = this.completedBlocks * this.players.length;
    }
    return { rolledBack: incomplete };
  }

  standings() {
    return standings(this.stats, this.players);
  }

  titles() {
    return awardTitles(this.stats);
  }
}
