import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import {
  DEFAULT_ANSWER_SECONDS,
  DEFAULT_CLIPS_PER_PERSON,
  MAX_PLAYERS,
  MAX_REPLACEMENTS_PER_PLAYER,
  MIN_PLAYERS,
  SPARE_CLIPS_PER_PERSON,
  type ErrorCode,
  type Notice,
  type NoticeKind,
  type Phase,
  type PoolStatus,
  type PoolSubmission,
  type Profile,
  type ResultsView,
  type RevealView,
  type RoomMode,
  type RoomSettings,
  type StartBlocker
} from '@liked/protocol';
import { assertTransition, buildQueues, cleanPools, createRng, isInMatch, MatchEngine } from '@liked/game-core';
import type { Timings } from '../config.js';
import { anon, type Logger } from '../logger.js';

export interface PlayerState {
  id: string;
  name: string;
  avatar: string;
  deviceId: string;
  tokenHash: string;
  socketId: string | null;
  connected: boolean;
  ready: boolean;
  mediaChecked: boolean;
  pool: PoolSubmission | null;
  poolStatus: PoolStatus;
  poolUsable: number;
  indexHashSet: Set<string>;
  waiting: boolean;
  removeTimer: NodeJS.Timeout | null;
  joinedAt: number;
}

interface RoundRuntime {
  roundId: string;
  loadAttempt: number;
  ready: Set<string>;
  failed: Set<string>;
  /** Wer beim gemeinsamen Start verbunden und bereit war – nur diese zählen für Startprüfung. */
  cohort: Set<string>;
  started: Set<string>;
  bufferingSince: Map<string, number>;
  bufferingTotal: Map<string, number>;
}

export interface RoomDeps {
  now: () => number;
  timings: Timings;
  reconnectWindowMs: number;
  log: Logger;
  /** Wird nach jeder Zustandsänderung aufgerufen (Broadcast personalisierter Sichten). */
  onChange: (room: Room) => void;
  onKick: (room: Room, player: PlayerState, reason: 'kicked' | 'room_closed') => void;
  onEmpty: (room: Room) => void;
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const newId = (prefix: string, bytes = 12) => `${prefix}${randomBytes(bytes).toString('base64url')}`;

export class Room {
  readonly id = newId('r_');
  readonly indexSalt = randomBytes(16).toString('hex');
  readonly createdAt: number;
  lastActivity: number;
  phase: Phase = 'LOBBY';
  version = 0;
  phaseEndsAt: number | null = null;
  paused = false;
  settings: RoomSettings = { clipsPerPerson: DEFAULT_CLIPS_PER_PERSON, answerSeconds: DEFAULT_ANSWER_SECONDS };
  hostId = '';
  readonly players = new Map<string, PlayerState>();
  /** In diesem Raum bereits gespielte Clip-IDs (für Revanche, begrenzt). */
  readonly playedIds = new Set<string>();
  match: MatchEngine | null = null;
  matchPlayers: string[] = [];
  runtime: RoundRuntime | null = null;
  reveal: RevealView | null = null;
  results: ResultsView | null = null;
  resultsAt: number | null = null;
  notices: Notice[] = [];
  closed = false;
  private timer: NodeJS.Timeout | null = null;
  private extraTimers = new Set<NodeJS.Timeout>();
  private noticeSeq = 0;

  constructor(
    readonly code: string,
    readonly mode: RoomMode,
    private readonly deps: RoomDeps
  ) {
    this.createdAt = deps.now();
    this.lastActivity = this.createdAt;
  }

  /* ------------------------------------------------------------ */
  /* Hilfsfunktionen                                              */
  /* ------------------------------------------------------------ */

  private get t(): Timings {
    return this.deps.timings;
  }

  private changed(): void {
    this.version++;
    this.lastActivity = this.deps.now();
    this.deps.onChange(this);
  }

  private setPhase(to: Phase, endsAt: number | null): void {
    assertTransition(this.phase, to);
    this.phase = to;
    this.phaseEndsAt = endsAt;
    this.deps.log.debug('phase', { room: anon(this.id), phase: to });
  }

  private schedule(ms: number, fn: () => void): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.closed) fn();
    }, Math.max(0, ms));
  }

  private scheduleExtra(ms: number, fn: () => void): void {
    const h = setTimeout(() => {
      this.extraTimers.delete(h);
      if (!this.closed) fn();
    }, Math.max(0, ms));
    this.extraTimers.add(h);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private clearAllTimers(): void {
    this.clearTimer();
    for (const h of this.extraTimers) clearTimeout(h);
    this.extraTimers.clear();
  }

  /** Anzahl aktiver Timer – für Leak-Tests. */
  get timerCount(): number {
    let n = this.timer ? 1 : 0;
    n += this.extraTimers.size;
    for (const p of this.players.values()) if (p.removeTimer) n++;
    return n;
  }

  private notice(kind: NoticeKind, param?: string): void {
    this.notices.push({ key: `${this.id}:${++this.noticeSeq}`, kind, param });
    if (this.notices.length > 6) this.notices.shift();
  }

  hashId(id: string): string {
    return createHmac('sha256', this.indexSalt).update(id).digest('hex').slice(0, 16);
  }

  get activePlayers(): PlayerState[] {
    return [...this.players.values()].filter((p) => !p.waiting);
  }

  /* ------------------------------------------------------------ */
  /* Beitritt, Verbindung, Verlassen                              */
  /* ------------------------------------------------------------ */

  addPlayer(profile: Profile, socketId: string): { player: PlayerState; token: string } | { error: ErrorCode } {
    if (this.players.size >= MAX_PLAYERS) return { error: 'room_full' };
    const token = randomBytes(32).toString('base64url');
    const player: PlayerState = {
      id: newId('p_', 9),
      name: profile.name,
      avatar: profile.avatar,
      deviceId: profile.deviceId,
      tokenHash: hashToken(token),
      socketId,
      connected: true,
      ready: false,
      mediaChecked: false,
      pool: null,
      poolStatus: 'missing',
      poolUsable: 0,
      indexHashSet: new Set(),
      // Während einer Partie: Beitritt bis zur nächsten Lobby zurückgestellt.
      waiting: this.phase !== 'LOBBY',
      removeTimer: null,
      joinedAt: this.deps.now()
    };
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
    this.changed();
    return { player, token };
  }

  findByToken(token: string): PlayerState | null {
    const h = hashToken(token);
    for (const p of this.players.values()) if (p.tokenHash === h) return p;
    return null;
  }

  resume(player: PlayerState, socketId: string): void {
    if (player.removeTimer) clearTimeout(player.removeTimer);
    player.removeTimer = null;
    player.socketId = socketId;
    player.connected = true;
    this.changed();
  }

  disconnect(playerId: string, socketId: string): void {
    const p = this.players.get(playerId);
    if (!p || p.socketId !== socketId) return;
    p.connected = false;
    p.socketId = null;
    if (p.removeTimer) clearTimeout(p.removeTimer);
    p.removeTimer = setTimeout(() => {
      p.removeTimer = null;
      this.removePlayer(p.id, 'timeout');
    }, this.deps.reconnectWindowMs);
    if (this.hostId === p.id) this.reassignHost();
    this.changed();
    // Laufende Vorbereitung: Getrennte Spieler blockieren den Start nicht.
    if (this.phase === 'PREPARING') this.checkAllLoaded();
  }

  removePlayer(playerId: string, reason: 'left' | 'kicked' | 'timeout'): void {
    const p = this.players.get(playerId);
    if (!p) return;
    if (p.removeTimer) clearTimeout(p.removeTimer);
    this.players.delete(playerId);
    if (reason === 'kicked') this.deps.onKick(this, p, 'kicked');
    if (this.players.size === 0) {
      this.close();
      this.deps.onEmpty(this);
      return;
    }
    if (this.hostId === playerId) this.reassignHost();
    this.notice('player_left', p.name);
    if (this.matchPlayers.includes(playerId) && isInMatch(this.phase)) {
      this.abortMatch('player_left');
      return;
    }
    this.recomputePools();
    this.changed();
  }

  private reassignHost(): void {
    const next =
      [...this.players.values()].find((p) => p.connected && !p.waiting && p.id !== this.hostId) ??
      [...this.players.values()].find((p) => p.id !== this.hostId);
    if (next && next.id !== this.hostId) {
      this.hostId = next.id;
      this.notice('host_changed', next.name);
    }
  }

  close(): void {
    this.closed = true;
    this.clearAllTimers();
    for (const p of this.players.values()) {
      if (p.removeTimer) clearTimeout(p.removeTimer);
      p.removeTimer = null;
    }
  }

  /* ------------------------------------------------------------ */
  /* Lobby                                                        */
  /* ------------------------------------------------------------ */

  updateSettings(by: string, patch: Partial<RoomSettings>): ErrorCode | null {
    if (by !== this.hostId) return 'not_host';
    if (this.phase !== 'LOBBY') return 'wrong_phase';
    const next = { ...this.settings, ...patch };
    if (next.clipsPerPerson === this.settings.clipsPerPerson && next.answerSeconds === this.settings.answerSeconds) return null;
    this.settings = next;
    // Einstellungsänderungen betreffen alle: Ready zurücksetzen.
    for (const p of this.players.values()) p.ready = false;
    this.recomputePools();
    this.changed();
    return null;
  }

  submitPool(playerId: string, pool: PoolSubmission): ErrorCode | null {
    const p = this.players.get(playerId);
    if (!p) return 'not_in_room';
    if (this.phase !== 'LOBBY' && !p.waiting) return 'wrong_phase';
    if (pool.source !== this.mode) return 'mode_mismatch';
    p.pool = pool;
    p.indexHashSet = new Set(pool.indexHashes);
    this.recomputePools();
    this.changed();
    return null;
  }

  /** Verfügbare Clips je Spieler nach Überschneidungsprüfung – ohne Clips offenzulegen. */
  recomputePools(): void {
    const withPool = this.activePlayers.filter((p) => p.pool);
    const { cleaned } = cleanPools(
      withPool.map((p) => ({
        playerId: p.id,
        source: p.pool!.source,
        candidates: p.pool!.candidates,
        indexHashes: p.indexHashSet
      })),
      (id) => this.hashId(id),
      this.playedIds
    );
    for (const p of this.players.values()) {
      if (!p.pool) {
        p.poolStatus = 'missing';
        p.poolUsable = 0;
        continue;
      }
      const usable = cleaned.get(p.id)?.length ?? 0;
      p.poolUsable = usable;
      p.poolStatus = usable >= this.settings.clipsPerPerson ? 'ok' : 'insufficient';
      if (p.poolStatus !== 'ok') p.ready = false;
    }
  }

  setMediaCheck(playerId: string, ok: boolean): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.mediaChecked = ok;
    if (!ok) p.ready = false;
    this.changed();
  }

  setReady(playerId: string, ready: boolean): ErrorCode | null {
    const p = this.players.get(playerId);
    if (!p) return 'not_in_room';
    if (this.phase !== 'LOBBY') return 'wrong_phase';
    if (ready && (p.poolStatus !== 'ok' || !p.mediaChecked)) return 'cannot_start';
    p.ready = ready;
    this.changed();
    return null;
  }

  kick(by: string, target: string): ErrorCode | null {
    if (by !== this.hostId) return 'not_host';
    if (this.phase !== 'LOBBY') return 'wrong_phase';
    if (target === by || !this.players.has(target)) return 'invalid_target';
    this.removePlayer(target, 'kicked');
    return null;
  }

  startBlockers(): StartBlocker[] {
    const b: StartBlocker[] = [];
    const active = this.activePlayers;
    if (active.length < MIN_PLAYERS) b.push({ kind: 'too_few_players', have: active.length, need: MIN_PLAYERS });
    const disc = active.filter((p) => !p.connected).map((p) => p.id);
    if (disc.length) b.push({ kind: 'disconnected', playerIds: disc });
    const missing = active.filter((p) => p.poolStatus === 'missing').map((p) => p.id);
    if (missing.length) b.push({ kind: 'pool_missing', playerIds: missing });
    const insufficient = active.filter((p) => p.poolStatus === 'insufficient').map((p) => p.id);
    if (insufficient.length)
      b.push({ kind: 'pool_insufficient', playerIds: insufficient, need: this.settings.clipsPerPerson });
    const unchecked = active.filter((p) => !p.mediaChecked).map((p) => p.id);
    if (unchecked.length) b.push({ kind: 'media_unchecked', playerIds: unchecked });
    const notReady = active.filter((p) => !p.ready).map((p) => p.id);
    if (notReady.length) b.push({ kind: 'not_ready', playerIds: notReady });
    return b;
  }

  start(by: string): ErrorCode | null {
    if (by !== this.hostId) return 'not_host';
    if (this.phase !== 'LOBBY') return 'wrong_phase';
    this.recomputePools();
    if (this.startBlockers().length) {
      this.changed();
      return 'cannot_start';
    }
    const active = this.activePlayers;
    const rng = createRng(randomInt(0, 2 ** 32 - 1));
    const { cleaned } = cleanPools(
      active.map((p) => ({ playerId: p.id, source: p.pool!.source, candidates: p.pool!.candidates, indexHashes: p.indexHashSet })),
      (id) => this.hashId(id),
      this.playedIds
    );
    const queues = buildQueues(
      cleaned,
      new Map(active.map((p) => [p.id, p.pool!.source])),
      this.settings.clipsPerPerson,
      SPARE_CLIPS_PER_PERSON,
      rng
    );
    // Fairer Ablauf muss von Anfang an möglich sein.
    for (const p of active) if ((queues.get(p.id)?.queue.length ?? 0) < this.settings.clipsPerPerson) return 'cannot_start';
    this.matchPlayers = active.map((p) => p.id);
    this.match = new MatchEngine({
      players: this.matchPlayers,
      clipsPerPerson: this.settings.clipsPerPerson,
      queues: new Map([...queues].map(([id, q]) => [id, q.queue])),
      rng,
      maxReplacements: MAX_REPLACEMENTS_PER_PLAYER * active.length
    });
    this.results = null;
    this.reveal = null;
    this.notices = [];
    // Kandidatenlisten werden nach der Übernahme in die Partie nicht mehr gebraucht.
    for (const p of active) {
      p.pool = null;
      p.indexHashSet = new Set();
    }
    this.deps.log.info('match_started', { room: anon(this.id), players: active.length });
    this.goPreparing();
    return null;
  }

  /** Sendet den aktuellen Stand erneut (ohne Versionssprung), z. B. nach einem Beitritt. */
  touchBroadcast(): void {
    this.deps.onChange(this);
  }

  react(): boolean {
    this.lastActivity = this.deps.now();
    return true;
  }

  /* ------------------------------------------------------------ */
  /* Rundenablauf                                                 */
  /* ------------------------------------------------------------ */

  private goPreparing(): void {
    const m = this.match!;
    this.reveal = null;
    const next = m.nextClip();
    if (next.kind === 'done') return this.finishMatch('complete');
    if (next.kind === 'exhausted' || next.kind === 'too_many_replacements') return this.abortMatch('pool_exhausted');
    const now = this.deps.now();
    const roundId = newId('rd_', 9);
    // Vorläufige Zeiten; Start wird erst gesetzt, wenn alle geladen haben.
    m.beginRound({ roundId, ownerId: next.ownerId, clip: next.clip, startAt: Number.MAX_SAFE_INTEGER, deadline: Number.MAX_SAFE_INTEGER });
    this.runtime = {
      roundId,
      loadAttempt: 1,
      ready: new Set(),
      failed: new Set(),
      cohort: new Set(),
      started: new Set(),
      bufferingSince: new Map(),
      bufferingTotal: new Map()
    };
    this.setPhase('PREPARING', now + this.t.preparingTimeoutMs);
    this.schedule(this.t.preparingTimeoutMs, () => this.onPrepareTimeout());
    this.changed();
  }

  playerStatus(playerId: string, roundId: string, status: 'ready' | 'failed'): ErrorCode | null {
    const rt = this.runtime;
    if (this.phase !== 'PREPARING' || !rt) return 'wrong_phase';
    if (rt.roundId !== roundId) return 'round_mismatch';
    if (!this.matchPlayers.includes(playerId)) return 'not_eligible';
    if (status === 'ready') {
      rt.ready.add(playerId);
      rt.failed.delete(playerId);
    } else {
      rt.failed.add(playerId);
      rt.ready.delete(playerId);
    }
    if (rt.failed.size > 0) this.retryOrReplace();
    else this.checkAllLoaded();
    return null;
  }

  private connectedMatchPlayers(): string[] {
    return this.matchPlayers.filter((id) => this.players.get(id)?.connected);
  }

  private checkAllLoaded(): void {
    const rt = this.runtime;
    if (this.phase !== 'PREPARING' || !rt) return;
    const needed = this.connectedMatchPlayers();
    if (needed.length > 0 && needed.every((id) => rt.ready.has(id))) this.goCountdown();
  }

  private onPrepareTimeout(): void {
    const rt = this.runtime;
    if (this.phase !== 'PREPARING' || !rt) return;
    for (const id of this.connectedMatchPlayers()) if (!rt.ready.has(id)) rt.failed.add(id);
    if (rt.failed.size === 0) return this.checkAllLoaded();
    this.retryOrReplace();
  }

  /** Begrenzter Retry, danach Ersatzclip derselben Quelle. */
  private retryOrReplace(): void {
    const rt = this.runtime!;
    if (rt.loadAttempt < 2) {
      rt.loadAttempt++;
      rt.failed.clear();
      rt.ready.clear();
      this.phaseEndsAt = this.deps.now() + this.t.preparingRetryMs;
      this.schedule(this.t.preparingRetryMs, () => this.onPrepareTimeout());
      this.changed();
      return;
    }
    this.match!.replaceBeforeStart();
    this.notice('clip_replaced');
    this.deps.log.info('clip_replaced', { room: anon(this.id), reason: 'load_failed' });
    this.goPreparing();
  }

  private goCountdown(): void {
    const m = this.match!;
    const rt = this.runtime!;
    const now = this.deps.now();
    const startAt = now + this.t.countdownMs;
    const deadline = startAt + this.settings.answerSeconds * 1000;
    m.reschedule(rt.roundId, startAt, deadline);
    rt.cohort = new Set(this.connectedMatchPlayers().filter((id) => rt.ready.has(id)));
    this.setPhase('COUNTDOWN', startAt);
    this.schedule(startAt - now, () => this.goPlaying());
    this.changed();
  }

  private goPlaying(): void {
    const m = this.match!;
    const r = m.current!;
    const rt = this.runtime!;
    this.setPhase('PLAYING_AND_VOTING', r.deadline);
    this.schedule(r.deadline - this.deps.now(), () => this.endRound());
    const roundId = rt.roundId;
    // Startprüfung: Abstimmungsberechtigte aus der Start-Kohorte müssen die Wiedergabe gestartet haben.
    this.scheduleExtra(this.t.maxStartDelayMs, () => {
      if (this.runtime?.roundId !== roundId || this.phase !== 'PLAYING_AND_VOTING') return;
      const late = [...rt.cohort].filter(
        (id) => id !== r.ownerId && !rt.started.has(id) && !r.votes.has(id) && this.players.get(id)?.connected
      );
      if (late.length) this.voidRound('start_delay');
    });
    this.changed();
  }

  playback(playerId: string, roundId: string, kind: 'started' | 'buffering' | 'resumed' | 'error'): ErrorCode | null {
    const rt = this.runtime;
    const r = this.match?.current;
    if (!rt || !r || rt.roundId !== roundId) return 'round_mismatch';
    if (this.phase !== 'COUNTDOWN' && this.phase !== 'PLAYING_AND_VOTING') return 'wrong_phase';
    if (r.status !== 'open') return 'too_late';
    // Nur Abstimmungsberechtigte ohne abgegebene Stimme beeinflussen die Fairness.
    if (!r.eligible.includes(playerId) || r.votes.has(playerId)) return null;
    const now = this.deps.now();
    switch (kind) {
      case 'started':
        rt.started.add(playerId);
        return null;
      case 'buffering': {
        if (rt.bufferingSince.has(playerId)) return null;
        rt.bufferingSince.set(playerId, now);
        this.scheduleExtra(this.t.maxBufferingMs, () => {
          if (this.runtime?.roundId !== roundId || this.match?.current?.status !== 'open') return;
          if (rt.bufferingSince.get(playerId) === now) this.voidRound('buffering');
        });
        return null;
      }
      case 'resumed': {
        rt.started.add(playerId);
        const since = rt.bufferingSince.get(playerId);
        if (since === undefined) return null;
        rt.bufferingSince.delete(playerId);
        const total = (rt.bufferingTotal.get(playerId) ?? 0) + (now - since);
        rt.bufferingTotal.set(playerId, total);
        if (total > this.t.maxTotalBufferingMs) this.voidRound('buffering_total');
        return null;
      }
      case 'error':
        this.voidRound('player_error');
        return null;
    }
  }

  /**
   * Neutrale Annullierung: Auswertung stoppen, keine Lösung enthüllen, keine
   * Punkt-/Streak-Änderung, Ersatz vom selben Besitzer.
   */
  private voidRound(reason: string): void {
    if (this.phase !== 'COUNTDOWN' && this.phase !== 'PLAYING_AND_VOTING') return;
    this.clearAllTimers();
    this.match!.voidRound();
    this.notice('round_voided');
    this.deps.log.info('round_voided', { room: anon(this.id), reason });
    this.goPreparing();
  }

  vote(playerId: string, roundId: string, targetId: string, voteId: string) {
    if (this.phase !== 'PLAYING_AND_VOTING' && this.phase !== 'REVEAL' && this.phase !== 'SCOREBOARD') {
      return { ok: false as const, error: 'wrong_phase' as ErrorCode };
    }
    const m = this.match!;
    const res = m.recordVote(playerId, roundId, targetId, voteId, this.deps.now());
    if (res.ok && !res.duplicate) {
      if (m.allEligibleVoted()) {
        const r = m.current!;
        const endAt = Math.min(r.deadline, this.deps.now() + this.t.allVotedGraceMs);
        this.phaseEndsAt = endAt;
        this.schedule(endAt - this.deps.now(), () => this.endRound());
      }
      this.changed();
    }
    return res;
  }

  private endRound(): void {
    if (this.phase !== 'PLAYING_AND_VOTING') return;
    this.clearAllTimers();
    const m = this.match!;
    const r = m.current!;
    const outcomes = m.finishRound();
    this.playedIds.add(r.clip.videoId);
    if (this.playedIds.size > 2000) this.playedIds.delete(this.playedIds.values().next().value!);
    this.reveal = {
      roundId: r.roundId,
      clip: r.clip,
      ownerId: r.ownerId,
      votes: outcomes.map((o) => ({
        voterId: o.voterId,
        targetId: o.targetId,
        correct: o.correct,
        rank: o.rank,
        basePoints: o.basePoints,
        multiplier: o.multiplierPercent / 100,
        points: o.points,
        streak: o.streak
      }))
    };
    const now = this.deps.now();
    this.setPhase('REVEAL', now + this.t.revealMs);
    this.schedule(this.t.revealMs, () => this.goScoreboard());
    this.changed();
  }

  private goScoreboard(): void {
    const now = this.deps.now();
    this.setPhase('SCOREBOARD', now + this.t.scoreboardMs);
    this.schedule(this.t.scoreboardMs, () => this.afterScoreboard());
    this.changed();
  }

  private afterScoreboard(): void {
    if (this.phase !== 'SCOREBOARD' || this.paused) return;
    if (this.match!.isComplete) return this.finishMatch('complete');
    this.goPreparing();
  }

  /** Host darf zwischen Runden (Rangliste) kurz pausieren. */
  hostPause(by: string, paused: boolean): ErrorCode | null {
    if (by !== this.hostId) return 'not_host';
    if (this.phase !== 'SCOREBOARD') return 'wrong_phase';
    if (paused === this.paused) return null;
    this.paused = paused;
    if (paused) {
      this.phaseEndsAt = this.deps.now() + this.t.maxHostPauseMs;
      this.schedule(this.t.maxHostPauseMs, () => this.hostPause(this.hostId, false));
    } else {
      this.phaseEndsAt = this.deps.now() + 1500;
      this.schedule(1500, () => this.afterScoreboard());
    }
    this.changed();
    return null;
  }

  private finishMatch(reason: ResultsView['endReason']): void {
    this.clearAllTimers();
    const m = this.match!;
    this.results = {
      standings: m.standings(),
      titles: m.titles(),
      completedBlocks: m.completedBlocks,
      plannedBlocks: m.totalBlocks,
      endReason: reason
    };
    this.resultsAt = this.deps.now();
    this.runtime = null;
    this.paused = false;
    this.setPhase('RESULTS', null);
    this.deps.log.info('match_finished', { room: anon(this.id), reason, count: m.completedBlocks });
    this.changed();
  }

  /**
   * Dauerhaftes Ausscheiden / erschöpfter Ersatzpool: laufenden Block inkl. Streaks
   * zurückrollen und mit abgeschlossenen Blöcken auswerten – sonst zurück zur Lobby.
   */
  abortMatch(reason: 'player_left' | 'pool_exhausted'): void {
    const m = this.match;
    if (!m || !isInMatch(this.phase)) return;
    this.clearAllTimers();
    const { rolledBack } = m.rollbackIncompleteBlock();
    if (rolledBack) this.notice('rolled_back');
    this.reveal = null;
    if (m.completedBlocks > 0) {
      this.finishMatch(reason);
      return;
    }
    this.notice('match_aborted');
    this.backToLobby();
  }

  private backToLobby(): void {
    this.clearAllTimers();
    this.runtime = null;
    this.reveal = null;
    this.paused = false;
    this.match = null;
    this.matchPlayers = [];
    this.setPhase('LOBBY', null);
    for (const p of this.players.values()) {
      p.ready = false;
      p.waiting = false;
      p.pool = null;
      p.indexHashSet = new Set();
    }
    this.recomputePools();
    this.changed();
  }

  /** Revanche bzw. Zur Lobby: Gruppe bleibt zusammen, bereits gespielte Clips bleiben ausgeschlossen. */
  toLobby(by: string): ErrorCode | null {
    if (by !== this.hostId) return 'not_host';
    if (this.phase !== 'RESULTS') return 'wrong_phase';
    this.results = null;
    this.resultsAt = null;
    this.backToLobby();
    return null;
  }
}
