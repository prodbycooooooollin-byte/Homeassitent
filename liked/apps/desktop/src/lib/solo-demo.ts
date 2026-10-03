import {
  DEFAULT_ANSWER_SECONDS,
  DEFAULT_CLIPS_PER_PERSON,
  SPARE_CLIPS_PER_PERSON,
  TIMINGS,
  type Ack,
  type ClipRef,
  type Phase,
  type PublicPlayer,
  type Reaction,
  type ResultsView,
  type RevealView,
  type RoomSettings,
  type RoomView,
  type RoundView,
  type StartBlocker
} from '@liked/protocol';
import { assertTransition, createRng, MatchEngine, type Rng } from '@liked/game-core';
import { demoLikes } from '@liked/tiktok-connectors';

/**
 * Lokale Solo-Demo: eine Partie gegen zwei klar gekennzeichnete, simulierte Mitspieler –
 * ohne Server und ohne TikTok. Nutzt dieselbe Spiel-Engine (MatchEngine) wie der Server und
 * erzeugt Zustände im selben Format (RoomView), damit die echten Spielbildschirme laufen.
 *
 * Die Mindestspielerzahl bleibt unverändert: Die Demo besteht immer aus drei Teilnehmern.
 * Nichts davon wird an einen Server übertragen.
 */
export interface SoloDemoDeps {
  me: { name: string; avatar: string; seed: string };
  onView(view: RoomView): void;
  onReaction?(r: Reaction): void;
  now?: () => number;
  random?: () => number;
  /** Zeitplan (für Tests verkürzbar). */
  timings?: Partial<typeof TIMINGS>;
  /** Trefferquote der simulierten Mitspieler (0–1). */
  botAccuracy?: number;
}

export const SOLO_ME_ID = 'p_solo_me_01';
export const SOLO_BOTS = [
  { id: 'p_solo_bot_mila', name: 'Mila', avatar: 'owl' },
  { id: 'p_solo_bot_jonas', name: 'Jonas', avatar: 'frog' }
] as const;

type Handler = (payload: Record<string, unknown>) => Ack<Record<string, unknown>>;

export class SoloDemo {
  readonly roomId = `r_solo_${Math.random().toString(36).slice(2, 10)}`;
  readonly code = 'DEMO01';
  private phase: Phase = 'LOBBY';
  private version = 0;
  private phaseEndsAt: number | null = null;
  private paused = false;
  private settings: RoomSettings = { clipsPerPerson: DEFAULT_CLIPS_PER_PERSON, answerSeconds: DEFAULT_ANSWER_SECONDS };
  private meReady = false;
  private meMediaChecked = false;
  private match: MatchEngine | null = null;
  private roundId = '';
  private loadAttempt = 1;
  private reveal: RevealView | null = null;
  private results: ResultsView | null = null;
  private readonly played = new Set<string>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly rng: Rng;
  private readonly now: () => number;
  private readonly t: typeof TIMINGS;
  private readonly accuracy: number;
  private closed = false;
  private seq = 0;

  constructor(private readonly deps: SoloDemoDeps) {
    this.now = deps.now ?? Date.now;
    const random = deps.random ?? Math.random;
    this.rng = createRng(Math.floor(random() * 2 ** 31));
    this.t = { ...TIMINGS, ...deps.timings };
    this.accuracy = deps.botAccuracy ?? 0.55;
  }

  /* ---------------- Ablaufsteuerung ---------------- */

  start(): void {
    this.changed();
    // Simulierte Mitspieler reagieren kurz auf den Beitritt.
    this.later(900, () => this.botReaction('👋'));
  }

  close(): void {
    this.closed = true;
    this.clearAll();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Anzahl aktiver Timer – für Tests auf Ressourcenlecks. */
  get timerCount(): number {
    return this.timers.size + (this.phaseTimer ? 1 : 0);
  }

  private later(ms: number, fn: () => void): void {
    const h = setTimeout(() => {
      this.timers.delete(h);
      if (!this.closed) fn();
    }, Math.max(0, ms));
    this.timers.add(h);
  }

  private schedule(ms: number, fn: () => void): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      if (!this.closed) fn();
    }, Math.max(0, ms));
  }

  private clearAll(): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
    for (const h of this.timers) clearTimeout(h);
    this.timers.clear();
  }

  private setPhase(to: Phase, endsAt: number | null): void {
    assertTransition(this.phase, to);
    this.phase = to;
    this.phaseEndsAt = endsAt;
  }

  private changed(): void {
    if (this.closed) return;
    this.version++;
    this.deps.onView(this.view());
  }

  private botReaction(emoji: string): void {
    const bot = SOLO_BOTS[Math.floor(this.rng() * SOLO_BOTS.length)]!;
    this.deps.onReaction?.({ id: `solo:${++this.seq}`, playerId: bot.id, emoji });
  }

  /* ---------------- Eingaben (gleiche Ereignisnamen wie beim Server) ---------------- */

  handle(event: string, payload: Record<string, unknown> = {}): Ack<Record<string, unknown>> {
    if (this.closed) return { ok: false, error: 'not_in_room' };
    const h = this.handlers[event];
    if (!h) return { ok: false, error: 'invalid_payload' };
    return h(payload);
  }

  private handlers: Record<string, Handler> = {
    timeSync: (p) => ({ ok: true, t0: p.t0, serverTime: this.now() }),
    updateSettings: (p) => {
      if (this.phase !== 'LOBBY') return { ok: false, error: 'wrong_phase' };
      const next = { ...this.settings, ...(p as Partial<RoomSettings>) };
      if (next.clipsPerPerson !== this.settings.clipsPerPerson || next.answerSeconds !== this.settings.answerSeconds) {
        this.settings = next;
        this.meReady = false; // wie im echten Spiel: Einstellungsänderung setzt Bereitschaft zurück
        this.changed();
      }
      return { ok: true };
    },
    submitPool: () => ({ ok: true }), // Demo erzeugt Beispielclips selbst
    mediaCheck: (p) => {
      this.meMediaChecked = p.ok === true;
      if (!this.meMediaChecked) this.meReady = false;
      this.changed();
      return { ok: true };
    },
    setReady: (p) => {
      if (this.phase !== 'LOBBY') return { ok: false, error: 'wrong_phase' };
      if (p.ready === true && !this.meMediaChecked) return { ok: false, error: 'cannot_start' };
      this.meReady = p.ready === true;
      this.changed();
      return { ok: true };
    },
    kick: () => ({ ok: false, error: 'invalid_target' }),
    react: (p) => {
      this.deps.onReaction?.({ id: `solo:${++this.seq}`, playerId: SOLO_ME_ID, emoji: String(p.emoji) });
      if (this.rng() < 0.6) this.later(700 + this.rng() * 900, () => this.botReaction(String(p.emoji)));
      return { ok: true };
    },
    start: () => {
      if (this.phase !== 'LOBBY') return { ok: false, error: 'wrong_phase' };
      if (this.blockers().length) return { ok: false, error: 'cannot_start' };
      this.startMatch();
      return { ok: true };
    },
    playerStatus: (p) => {
      if (this.phase !== 'PREPARING' || p.roundId !== this.roundId) return { ok: false, error: 'round_mismatch' };
      if (p.status === 'ready') this.goCountdown();
      else this.retryOrReplace();
      return { ok: true };
    },
    playback: () => ({ ok: true }),
    vote: (p) => {
      if (this.phase !== 'PLAYING_AND_VOTING' && this.phase !== 'REVEAL' && this.phase !== 'SCOREBOARD') {
        return { ok: false, error: 'wrong_phase' };
      }
      const m = this.match!;
      const res = m.recordVote(SOLO_ME_ID, String(p.roundId), String(p.targetId), String(p.voteId), this.now());
      if (!res.ok) return { ok: false, error: res.error };
      if (!res.duplicate) this.afterVote();
      return { ok: true, vote: { targetId: res.targetId, voteId: res.voteId, confirmed: true } };
    },
    hostPause: (p) => {
      if (this.phase !== 'SCOREBOARD') return { ok: false, error: 'wrong_phase' };
      this.paused = p.paused === true;
      if (this.paused) this.schedule(this.t.maxHostPauseMs, () => this.handle('hostPause', { paused: false }));
      else this.schedule(1500, () => this.afterScoreboard());
      this.phaseEndsAt = this.now() + (this.paused ? this.t.maxHostPauseMs : 1500);
      this.changed();
      return { ok: true };
    },
    rematch: () => this.toLobby(),
    toLobby: () => this.toLobby(),
    leaveRoom: () => {
      this.close();
      return { ok: true };
    }
  };

  /* ---------------- Lobby ---------------- */

  private blockers(): StartBlocker[] {
    const b: StartBlocker[] = [];
    if (!this.meMediaChecked) b.push({ kind: 'media_unchecked', playerIds: [SOLO_ME_ID] });
    if (!this.meReady) b.push({ kind: 'not_ready', playerIds: [SOLO_ME_ID] });
    return b;
  }

  private toLobby(): Ack<Record<string, unknown>> {
    if (this.phase !== 'RESULTS') return { ok: false, error: 'wrong_phase' };
    this.clearAll();
    this.match = null;
    this.reveal = null;
    this.results = null;
    this.meReady = false;
    this.setPhase('LOBBY', null);
    this.changed();
    return { ok: true };
  }

  /* ---------------- Partie ---------------- */

  private queueFor(seed: string): ClipRef[] {
    const need = this.settings.clipsPerPerson + SPARE_CLIPS_PER_PERSON;
    const all = demoLikes(seed, 200).filter((l) => !this.played.has(l.videoId));
    const picked: ClipRef[] = [];
    for (const l of all) {
      picked.push({ source: 'demo', videoId: l.videoId } as ClipRef);
      if (picked.length >= need) break;
    }
    return picked;
  }

  private startMatch(): void {
    const ids = [SOLO_ME_ID, ...SOLO_BOTS.map((b) => b.id)];
    const seeds = [this.deps.me.seed, ...SOLO_BOTS.map((b) => `${b.id}:${this.deps.me.seed}`)];
    this.match = new MatchEngine({
      players: ids,
      clipsPerPerson: this.settings.clipsPerPerson,
      queues: new Map(ids.map((id, i) => [id, this.queueFor(seeds[i]!)])),
      rng: this.rng,
      maxReplacements: 9
    });
    this.results = null;
    this.goPreparing();
  }

  private goPreparing(): void {
    const m = this.match!;
    this.reveal = null;
    const next = m.nextClip();
    if (next.kind !== 'clip') return this.finish(next.kind === 'done' ? 'complete' : 'pool_exhausted');
    this.roundId = `rd_solo${++this.seq}x`;
    this.loadAttempt = 1;
    m.beginRound({ roundId: this.roundId, ownerId: next.ownerId, clip: next.clip, startAt: Number.MAX_SAFE_INTEGER, deadline: Number.MAX_SAFE_INTEGER });
    this.setPhase('PREPARING', this.now() + this.t.preparingTimeoutMs);
    this.schedule(this.t.preparingTimeoutMs, () => this.retryOrReplace());
    this.changed();
  }

  private retryOrReplace(): void {
    if (this.phase !== 'PREPARING') return;
    if (this.loadAttempt < 2) {
      this.loadAttempt++;
      this.phaseEndsAt = this.now() + this.t.preparingRetryMs;
      this.schedule(this.t.preparingRetryMs, () => this.retryOrReplace());
      this.changed();
      return;
    }
    this.match!.replaceBeforeStart();
    this.goPreparing();
  }

  private goCountdown(): void {
    if (this.phase !== 'PREPARING') return;
    const m = this.match!;
    const startAt = this.now() + this.t.countdownMs;
    const deadline = startAt + this.settings.answerSeconds * 1000;
    m.reschedule(this.roundId, startAt, deadline);
    this.setPhase('COUNTDOWN', startAt);
    this.schedule(this.t.countdownMs, () => this.goPlaying());
    this.changed();
  }

  private goPlaying(): void {
    const m = this.match!;
    const r = m.current!;
    this.setPhase('PLAYING_AND_VOTING', r.deadline);
    this.schedule(r.deadline - this.now(), () => this.endRound());
    // Simulierte Mitspieler tippen nach einer zufälligen Bedenkzeit.
    const window = this.settings.answerSeconds * 1000;
    for (const bot of SOLO_BOTS) {
      if (!r.eligible.includes(bot.id)) continue;
      const delay = 1500 + this.rng() * Math.min(window * 0.7, 9000);
      const roundId = this.roundId;
      this.later(delay, () => {
        const cur = this.match?.current;
        if (!cur || cur.roundId !== roundId || this.phase !== 'PLAYING_AND_VOTING') return;
        const options = m.players.filter((p) => p !== bot.id);
        const target =
          this.rng() < this.accuracy ? cur.ownerId : options.filter((p) => p !== cur.ownerId)[Math.floor(this.rng() * (options.length - 1))]!;
        const res = m.recordVote(bot.id, roundId, target, `v_${bot.id}_${roundId}`, this.now());
        if (res.ok && !res.duplicate) this.afterVote();
      });
    }
    this.changed();
  }

  private afterVote(): void {
    const m = this.match!;
    if (m.allEligibleVoted()) {
      const endAt = Math.min(m.current!.deadline, this.now() + this.t.allVotedGraceMs);
      this.phaseEndsAt = endAt;
      this.schedule(endAt - this.now(), () => this.endRound());
    }
    this.changed();
  }

  private endRound(): void {
    if (this.phase !== 'PLAYING_AND_VOTING') return;
    const m = this.match!;
    const r = m.current!;
    const outcomes = m.finishRound();
    this.played.add(r.clip.videoId);
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
    this.setPhase('REVEAL', this.now() + this.t.revealMs);
    this.schedule(this.t.revealMs, () => {
      this.setPhase('SCOREBOARD', this.now() + this.t.scoreboardMs);
      this.schedule(this.t.scoreboardMs, () => this.afterScoreboard());
      this.changed();
    });
    this.changed();
  }

  private afterScoreboard(): void {
    if (this.phase !== 'SCOREBOARD' || this.paused) return;
    if (this.match!.isComplete) return this.finish('complete');
    this.goPreparing();
  }

  private finish(reason: ResultsView['endReason']): void {
    this.clearAll();
    const m = this.match!;
    this.results = {
      standings: m.standings(),
      titles: m.titles(),
      completedBlocks: m.completedBlocks,
      plannedBlocks: m.totalBlocks,
      endReason: reason
    };
    this.paused = false;
    this.setPhase('RESULTS', null);
    this.changed();
  }

  /* ---------------- Sicht (gleiches Format wie der Server) ---------------- */

  private players(): PublicPlayer[] {
    const me: PublicPlayer = {
      id: SOLO_ME_ID,
      name: this.deps.me.name,
      avatar: this.deps.me.avatar,
      isHost: true,
      ready: this.meReady,
      connected: true,
      mediaChecked: this.meMediaChecked,
      poolStatus: 'ok',
      waiting: false
    };
    return [
      me,
      ...SOLO_BOTS.map((b) => ({
        id: b.id,
        name: b.name,
        avatar: b.avatar,
        isHost: false,
        ready: true,
        connected: true,
        mediaChecked: true,
        poolStatus: 'ok' as const,
        waiting: false,
        simulated: true
      }))
    ];
  }

  view(): RoomView {
    const m = this.match;
    const inRound = this.phase === 'PREPARING' || this.phase === 'COUNTDOWN' || this.phase === 'PLAYING_AND_VOTING';
    let round: RoundView | null = null;
    if (inRound && m?.current) {
      const r = m.current;
      const isOwner = r.ownerId === SOLO_ME_ID;
      const own = r.votes.get(SOLO_ME_ID);
      const scheduled = this.phase !== 'PREPARING';
      round = {
        roundId: r.roundId,
        clip: r.clip,
        startAt: scheduled ? r.startAt : 0,
        deadline: scheduled ? r.deadline : 0,
        answerSeconds: this.settings.answerSeconds,
        answerOptions: isOwner ? [] : m.players.filter((id) => id !== SOLO_ME_ID),
        you: { role: isOwner ? 'owner' : 'voter', vote: own ? { targetId: own.targetId, voteId: own.voteId, confirmed: true } : null },
        votesIn: r.votes.size,
        votersTotal: r.eligible.length,
        loadAttempt: this.loadAttempt
      };
    }
    const showReveal = this.phase === 'REVEAL' || this.phase === 'SCOREBOARD';
    return {
      roomId: this.roomId,
      code: this.code,
      version: this.version,
      mode: 'demo',
      solo: true,
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      paused: this.paused,
      settings: { ...this.settings },
      youId: SOLO_ME_ID,
      hostId: SOLO_ME_ID,
      players: this.players(),
      scores: this.phase === 'LOBBY' || !m ? [] : m.standings(),
      roundNumber: m ? m.roundNumber : 0,
      totalRounds: m ? m.totalRounds : 0,
      blockIndex: m ? Math.max(0, m.blockIndex) : 0,
      totalBlocks: m ? m.totalBlocks : 0,
      round,
      reveal: showReveal && this.reveal ? structuredClone(this.reveal) : null,
      results: this.phase === 'RESULTS' && this.results ? structuredClone(this.results) : null,
      notices: [],
      startBlockers: this.phase === 'LOBBY' ? this.blockers() : []
    };
  }
}
