import {
  CATEGORIES,
  LIMITS,
  TIMINGS,
  sanitizeText,
  votesNeeded,
  type AbortReason,
  type ClientCommand,
  type ClueCard,
  type EarlyVoteOutcome,
  type MatchPhase,
  type MatchPublic,
  type MatchResult,
  type PlayerId,
  type PrivateView,
  type Role,
  type WinReason,
} from '../../shared/protocol.ts';
import { WORDS, clueKey, isCorrectGuess, type WordEntry } from '../words.ts';
import type { CommandResult, MatchContext, MatchController, MatchSetup } from './types.ts';

const OK: CommandResult = { ok: true };
const fail = (code: Extract<CommandResult, { ok: false }>['code']): CommandResult => ({ ok: false, code });

interface DisconnectState {
  since: number | null;
  usedMs: number;
}

/** Wählt ein Wort aus dem Pool; vermeidet Wiederholungen, solange möglich. */
export function pickWord(setup: MatchSetup, randomInt: (n: number) => number): WordEntry {
  const pool = WORDS.filter((w) => setup.settings.categories.includes(w.category));
  const source = pool.length > 0 ? pool : WORDS;
  let fresh = source.filter((w) => !setup.usedWordIds.has(w.id));
  if (fresh.length === 0) {
    for (const w of source) setup.usedWordIds.delete(w.id);
    fresh = source;
  }
  return fresh[randomInt(fresh.length)];
}

/**
 * Klassischer Modus: genau ein Impostor, Hinweise reihum, vorzeitige und
 * verpflichtende Abstimmung, ein verbindlicher Rateversuch.
 *
 * Alle Methoden laufen synchron im Node-Eventloop; jede Zustandsänderung ist
 * dadurch atomar. `over` verhindert, dass nach dem ersten Ergebnis ein zweites
 * entstehen kann (Rateversuch vs. Timer vs. Wahlbeginn).
 */
export class ClassicMatch implements MatchController {
  readonly mode = 'classic' as const;
  readonly id: string;
  readonly participants: readonly PlayerId[];

  private readonly ctx: MatchContext;
  private readonly impostorId: PlayerId;
  private readonly word: WordEntry;
  private readonly startIndex: number;
  private readonly maxRounds: number;
  private readonly turnMs: number | null;
  private readonly categoryHint: string | null;

  private phase: MatchPhase = 'roleReveal';
  private over = false;
  private round = 1;
  private turnIndex = 0;
  private deadline: number | null;
  private deadlineTotal: number | null;
  /** Gesicherte Restzeit während einer Verbindungspause */
  private pausedRemaining: number | null = null;
  private paused = false;
  private readonly disconnect = new Map<PlayerId, DisconnectState>();

  private readonly acks = new Set<PlayerId>();
  private readonly clues: ClueCard[] = [];
  private readonly clueKeys = new Set<string>();

  private proposal: Set<PlayerId> | null = null;
  private readonly proposedThisRound = new Set<PlayerId>();
  private proposalsLocked = false;

  private voteKind: 'early' | 'final' | null = null;
  private readonly votes = new Map<PlayerId, PlayerId>();
  private readonly readyToVote = new Set<PlayerId>();
  /** Restzeit des unterbrochenen Zugs bei vorzeitiger Abstimmung */
  private interruptedTurn: { remaining: number | null; total: number | null } | null = null;
  private lastEarlyVote: EarlyVoteOutcome | null = null;
  private guessUsed = false;

  constructor(ctx: MatchContext, setup: MatchSetup) {
    this.ctx = ctx;
    this.id = ctx.newId();
    this.participants = [...setup.participants];
    const n = this.participants.length;
    this.impostorId = this.participants[ctx.randomInt(n)];
    this.word = pickWord(setup, (k) => ctx.randomInt(k));
    setup.usedWordIds.add(this.word.id);
    this.startIndex = ctx.randomInt(n);
    this.maxRounds = setup.settings.maxRounds;
    this.turnMs = setup.settings.turnSeconds > 0 ? setup.settings.turnSeconds * 1000 : null;
    this.categoryHint = setup.settings.categoryHint
      ? (CATEGORIES.find((c) => c.id === this.word.category)?.label ?? null)
      : null;
    for (const p of this.participants) this.disconnect.set(p, { since: null, usedMs: 0 });
    this.deadline = ctx.now() + TIMINGS.roleRevealMs;
    this.deadlineTotal = TIMINGS.roleRevealMs;
  }

  // -------------------------------------------------------------------------
  // Abfragen

  isOver(): boolean {
    return this.over;
  }

  private isParticipant(p: PlayerId): boolean {
    return this.participants.includes(p);
  }

  get activePlayerId(): PlayerId | null {
    if (this.phase !== 'clues') return null;
    const n = this.participants.length;
    return this.participants[(this.startIndex + (this.round - 1) + this.turnIndex) % n];
  }

  private get needed(): number {
    return votesNeeded(this.participants.length);
  }

  // -------------------------------------------------------------------------
  // Kommandos

  handle(playerId: PlayerId, cmd: ClientCommand): CommandResult {
    if (this.over) return fail('wrong_phase');
    if (!this.isParticipant(playerId)) return fail('not_allowed');
    switch (cmd.t) {
      case 'ackRole':
        return this.ackRole(playerId);
      case 'submitClue':
        return this.submitClue(playerId, cmd.text);
      case 'proposeVote':
        return this.proposeVote(playerId);
      case 'withdrawSupport':
        return this.withdrawSupport(playerId);
      case 'readyToVote':
        return this.markReadyToVote(playerId);
      case 'castVote':
        return this.castVote(playerId, cmd.targetId);
      case 'guessWord':
        return this.guess(playerId, cmd.text);
      default:
        return fail('bad_request');
    }
  }

  private ackRole(p: PlayerId): CommandResult {
    if (this.phase !== 'roleReveal') return fail('wrong_phase');
    if (this.paused) return fail('paused');
    if (this.acks.has(p)) return OK; // idempotent
    this.acks.add(p);
    if (this.acks.size === this.participants.length) this.startClues();
    return OK;
  }

  private submitClue(p: PlayerId, raw: unknown): CommandResult {
    if (this.phase !== 'clues') return fail('wrong_phase');
    if (this.paused) return fail('paused');
    if (this.activePlayerId !== p) return fail('not_your_turn');
    if (typeof raw !== 'string') return fail('bad_request');
    // Längenprüfung vor dem Kürzen, damit nichts stillschweigend abgeschnitten wird.
    const text = sanitizeText(raw, 1000);
    if (!text) return fail('empty');
    if ([...text].length > LIMITS.clueMax) return fail('too_long');
    // Gleiche Regeln für alle Rollen. Bewusst KEIN Vergleich mit dem geheimen Wort.
    const key = clueKey(text);
    if (this.clueKeys.has(key)) return fail('duplicate');
    this.clueKeys.add(key);
    this.clues.push({ id: this.ctx.newId(), playerId: p, round: this.round, text });
    this.advanceTurn();
    return OK;
  }

  private proposeVote(p: PlayerId): CommandResult {
    if (this.phase !== 'clues') return fail('wrong_phase');
    if (this.paused) return fail('paused');
    if (this.proposalsLocked) return fail('wrong_phase');
    if (this.proposal) {
      if (this.proposal.has(p)) return fail('already_done');
      this.proposal.add(p);
    } else {
      if (this.proposedThisRound.has(p)) return fail('already_done');
      this.proposedThisRound.add(p);
      this.proposal = new Set([p]);
    }
    if (this.proposal.size >= this.needed) this.startDiscussion('early');
    return OK;
  }

  private withdrawSupport(p: PlayerId): CommandResult {
    if (this.phase !== 'clues') return fail('wrong_phase');
    if (!this.proposal || !this.proposal.has(p)) return fail('already_done');
    this.proposal.delete(p);
    if (this.proposal.size === 0) this.proposal = null;
    return OK;
  }

  private markReadyToVote(p: PlayerId): CommandResult {
    if (this.phase !== 'discussion') return fail('wrong_phase');
    if (this.paused) return fail('paused');
    this.readyToVote.add(p);
    if (this.readyToVote.size === this.participants.length) this.startVoting();
    return OK;
  }

  private castVote(p: PlayerId, target: unknown): CommandResult {
    if (this.phase !== 'voting') return fail('wrong_phase');
    if (this.paused) return fail('paused');
    if (typeof target !== 'string' || target === p || !this.isParticipant(target)) {
      return fail('invalid_target');
    }
    if (this.votes.has(p)) return fail('already_done');
    this.votes.set(p, target);
    if (this.votes.size === this.participants.length) this.resolveVotes();
    return OK;
  }

  private guess(p: PlayerId, raw: unknown): CommandResult {
    // Nur der Impostor. Für andere Rollen ist die Aktion lokal gar nicht sichtbar.
    if (p !== this.impostorId) return fail('not_allowed');
    if (this.guessUsed) return fail('already_done');
    if (this.phase !== 'clues' && this.phase !== 'discussion') return fail('wrong_phase');
    if (this.paused) return fail('paused');
    if (typeof raw !== 'string') return fail('bad_request');
    const text = sanitizeText(raw, LIMITS.guessMax);
    if (!text) return fail('empty');
    this.guessUsed = true;
    const correct = isCorrectGuess(this.word, text);
    this.finish(correct ? 'impostor' : 'insider', correct ? 'guess_correct' : 'guess_wrong', { guess: text });
    return OK;
  }

  // -------------------------------------------------------------------------
  // Phasenübergänge

  private setDeadline(ms: number | null): void {
    this.deadline = ms === null ? null : this.ctx.now() + ms;
    this.deadlineTotal = ms;
  }

  private startClues(): void {
    this.phase = 'clues';
    this.round = 1;
    this.turnIndex = 0;
    this.setDeadline(this.turnMs);
  }

  private advanceTurn(): void {
    this.turnIndex += 1;
    if (this.turnIndex >= this.participants.length) {
      // Durchgang beendet: Vorschläge verfallen.
      this.proposal = null;
      this.proposedThisRound.clear();
      this.proposalsLocked = false;
      if (this.round >= this.maxRounds) {
        this.startDiscussion('final');
        return;
      }
      this.round += 1;
      this.turnIndex = 0;
    }
    this.setDeadline(this.turnMs);
  }

  private startDiscussion(kind: 'early' | 'final'): void {
    if (kind === 'early') {
      this.interruptedTurn = {
        remaining: this.deadline === null ? null : Math.max(0, this.deadline - this.ctx.now()),
        total: this.deadlineTotal,
      };
    }
    this.proposal = null;
    this.voteKind = kind;
    this.phase = 'discussion';
    this.readyToVote.clear();
    this.setDeadline(TIMINGS.discussionMs);
  }

  private startVoting(): void {
    this.phase = 'voting';
    this.votes.clear();
    this.setDeadline(TIMINGS.votingMs);
  }

  private resolveVotes(): void {
    const counts = new Map<PlayerId, number>();
    for (const target of this.votes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
    let accused: PlayerId | null = null;
    for (const [target, c] of counts) if (c >= this.needed) accused = target;

    const votesList = this.participants.map((voterId) => ({
      voterId,
      targetId: this.votes.get(voterId) ?? null,
    }));

    if (accused !== null) {
      const caught = accused === this.impostorId;
      this.finish(caught ? 'insider' : 'impostor', caught ? 'impostor_caught' : 'wrong_accusation', {
        votes: votesList,
        accusedId: accused,
      });
      return;
    }
    if (this.voteKind === 'final') {
      this.finish('impostor', 'no_majority', { votes: votesList });
      return;
    }
    // Vorzeitige Abstimmung ohne absolute Mehrheit: zurück zum unterbrochenen Zug.
    this.lastEarlyVote = {
      round: this.round,
      counts: this.participants
        .map((p) => ({ playerId: p, votes: counts.get(p) ?? 0 }))
        .filter((c) => c.votes > 0),
      abstentions: this.participants.length - this.votes.size,
    };
    this.proposalsLocked = true;
    this.voteKind = null;
    this.votes.clear();
    this.readyToVote.clear();
    this.phase = 'clues';
    const it = this.interruptedTurn;
    this.interruptedTurn = null;
    this.deadline = it && it.remaining !== null ? this.ctx.now() + it.remaining : null;
    this.deadlineTotal = it?.total ?? null;
  }

  private finish(
    winner: Role,
    reason: WinReason,
    extra: { guess?: string; votes?: MatchResult['votes']; accusedId?: PlayerId },
  ): void {
    if (this.over) return;
    this.over = true;
    this.phase = 'resolution';
    this.deadline = null;
    const winners =
      winner === 'impostor' ? [this.impostorId] : this.participants.filter((p) => p !== this.impostorId);
    this.ctx.finish({
      matchId: this.id,
      endedAt: this.ctx.now(),
      outcome: 'win',
      winner,
      reason,
      abortReason: null,
      abortPlayerId: null,
      impostorId: this.impostorId,
      word: this.word.word,
      category: this.word.category,
      guess: extra.guess ?? null,
      votes: extra.votes ?? null,
      accusedId: extra.accusedId ?? null,
      clues: [...this.clues],
      seatOrder: [...this.participants],
      winners,
    });
  }

  private abortWith(reason: AbortReason, playerId: PlayerId | null): void {
    if (this.over) return;
    this.over = true;
    this.phase = 'aborted';
    this.deadline = null;
    // Ohne Wertung: Rolle und Wort werden nicht aufgedeckt, damit ein Abbruch
    // nicht zum Ausspähen genutzt werden kann.
    this.ctx.finish({
      matchId: this.id,
      endedAt: this.ctx.now(),
      outcome: 'aborted',
      winner: null,
      reason: null,
      abortReason: reason,
      abortPlayerId: playerId,
      impostorId: null,
      word: null,
      category: null,
      guess: null,
      votes: null,
      accusedId: null,
      clues: [...this.clues],
      seatOrder: [...this.participants],
      winners: [],
    });
  }

  abort(reason: 'server_restart'): void {
    this.abortWith(reason, null);
  }

  leave(playerId: PlayerId): void {
    if (this.isParticipant(playerId)) this.abortWith('player_left', playerId);
  }

  // -------------------------------------------------------------------------
  // Verbindung / Pause

  setConnected(playerId: PlayerId, connected: boolean): void {
    if (this.over) return;
    const st = this.disconnect.get(playerId);
    if (!st) return;
    const now = this.ctx.now();
    if (!connected) {
      if (st.since !== null) return;
      st.since = now;
      if (!this.paused) {
        this.paused = true;
        this.pausedRemaining = this.deadline === null ? null : Math.max(0, this.deadline - now);
        this.deadline = null;
      }
      return;
    }
    if (st.since === null) return;
    st.usedMs += now - st.since;
    st.since = null;
    if (st.usedMs >= TIMINGS.disconnectBudgetMs) {
      this.abortWith('disconnect_timeout', playerId);
      return;
    }
    const stillMissing = [...this.disconnect.values()].some((s) => s.since !== null);
    if (!stillMissing && this.paused) {
      this.paused = false;
      this.deadline = this.pausedRemaining === null ? null : now + this.pausedRemaining;
      this.pausedRemaining = null;
    }
  }

  private abortAtFor(st: DisconnectState): number | null {
    if (st.since === null) return null;
    const budgetLeft = Math.max(0, TIMINGS.disconnectBudgetMs - st.usedMs);
    return st.since + Math.min(TIMINGS.reconnectGraceMs, budgetLeft);
  }

  private pauseAbort(): { at: number; playerId: PlayerId } | null {
    let best: { at: number; playerId: PlayerId } | null = null;
    for (const [pid, st] of this.disconnect) {
      const at = this.abortAtFor(st);
      if (at !== null && (!best || at < best.at)) best = { at, playerId: pid };
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Zeitsteuerung

  nextWakeAt(): number | null {
    if (this.over) return null;
    if (this.paused) return this.pauseAbort()?.at ?? null;
    return this.deadline;
  }

  tick(): void {
    // Mehrere Fristen können gleichzeitig abgelaufen sein (z. B. nach Stau im Eventloop).
    for (let guard = 0; guard < 500 && !this.over; guard++) {
      const now = this.ctx.now();
      if (this.paused) {
        const pa = this.pauseAbort();
        if (pa && now >= pa.at) this.abortWith('disconnect_timeout', pa.playerId);
        return;
      }
      if (this.deadline === null || now < this.deadline) return;
      switch (this.phase) {
        case 'roleReveal':
          this.abortWith('role_timeout', null);
          return;
        case 'clues':
          // Neutral: „Kein Hinweis abgegeben". Es wird nichts erfunden.
          this.clues.push({ id: this.ctx.newId(), playerId: this.activePlayerId!, round: this.round, text: null });
          this.advanceTurn();
          break;
        case 'discussion':
          this.startVoting();
          break;
        case 'voting':
          this.resolveVotes();
          break;
        default:
          return;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Sichten

  publicView(_forPlayer: PlayerId): MatchPublic {
    const pa = this.paused ? this.pauseAbort() : null;
    return {
      id: this.id,
      mode: this.mode,
      phase: this.phase,
      seatOrder: [...this.participants],
      round: this.round,
      maxRounds: this.maxRounds,
      activePlayerId: this.activePlayerId,
      deadline: this.paused ? null : this.deadline,
      deadlineTotalMs: this.deadlineTotal,
      pausedRemainingMs: this.paused ? this.pausedRemaining : null,
      turnSeconds: this.turnMs === null ? 0 : this.turnMs / 1000,
      clues: this.clues.map((c) => ({ ...c })),
      acknowledged: [...this.acks],
      proposal: this.proposal ? { supporters: [...this.proposal], needed: this.needed } : null,
      proposedThisRound: [...this.proposedThisRound],
      proposalsLocked: this.proposalsLocked,
      voteKind: this.voteKind,
      voted: this.phase === 'voting' ? [...this.votes.keys()] : [],
      readyToVote: [...this.readyToVote],
      votesNeeded: this.needed,
      lastEarlyVote: this.lastEarlyVote,
      categoryHint: this.categoryHint,
      paused: this.paused
        ? {
            playerIds: [...this.disconnect].filter(([, s]) => s.since !== null).map(([p]) => p),
            abortAt: pa?.at ?? this.ctx.now(),
          }
        : null,
    };
  }

  privateView(forPlayer: PlayerId): PrivateView {
    const isImpostor = forPlayer === this.impostorId;
    return {
      role: isImpostor ? 'impostor' : 'insider',
      word: isImpostor ? null : this.word.word,
      canGuess:
        isImpostor &&
        !this.guessUsed &&
        !this.paused &&
        (this.phase === 'clues' || this.phase === 'discussion'),
      guessUsed: isImpostor ? this.guessUsed : false,
      myVote: this.phase === 'voting' ? (this.votes.get(forPlayer) ?? null) : null,
    };
  }
}
