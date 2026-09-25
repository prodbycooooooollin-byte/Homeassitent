import {
  CATEGORIES,
  DEFAULT_SETTINGS,
  LIMITS,
  ROUND_OPTIONS,
  TIMINGS,
  TURN_SECONDS_OPTIONS,
  sanitizeText,
  type ChatMessage,
  type ClientCommand,
  type ClientView,
  type LobbySettings,
  type MatchResult,
  type PlayerId,
  type Profile,
} from '../shared/protocol.ts';
import { ClassicMatch } from './modes/classic.ts';
import type { CommandResult, MatchContext, MatchController } from './modes/types.ts';

const OK: CommandResult = { ok: true };
const fail = (code: Extract<CommandResult, { ok: false }>['code']): CommandResult => ({ ok: false, code });

export interface LobbyEnv {
  now(): number;
  randomInt(maxExclusive: number): number;
  newId(): string;
}

interface Member {
  id: PlayerId;
  name: string;
  avatar: number;
  joinedAt: number;
  connected: boolean;
  disconnectedAt: number | null;
  ready: boolean;
  score: number;
  chatTimes: number[];
}

const MAX_CHAT = 120;

export class Lobby {
  readonly code: string;
  private readonly env: LobbyEnv;
  private readonly members = new Map<PlayerId, Member>();
  private readonly banned = new Set<PlayerId>();
  private readonly usedWordIds = new Set<string>();
  private hostId: PlayerId = '';
  private settings: LobbySettings = { ...DEFAULT_SETTINGS, categories: [...DEFAULT_SETTINGS.categories] };
  private match: MatchController | null = null;
  private lastResult: MatchResult | null = null;
  private chat: ChatMessage[] = [];
  private seq = 0;
  rev = 0;

  constructor(code: string, env: LobbyEnv) {
    this.code = code;
    this.env = env;
  }

  get size(): number {
    return this.members.size;
  }

  get isEmpty(): boolean {
    return this.members.size === 0;
  }

  get hasRunningMatch(): boolean {
    return this.match !== null && !this.match.isOver();
  }

  has(playerId: PlayerId): boolean {
    return this.members.has(playerId);
  }

  memberIds(): PlayerId[] {
    return [...this.members.keys()];
  }

  private bump(): void {
    this.rev += 1;
  }

  // -------------------------------------------------------------------------
  // Mitglieder

  join(playerId: PlayerId, profile: Profile): CommandResult {
    if (this.banned.has(playerId)) return fail('kicked');
    const existing = this.members.get(playerId);
    if (existing) {
      this.setConnected(playerId, true);
      return OK;
    }
    if (this.members.size >= LIMITS.maxPlayers) return fail('lobby_full');
    this.members.set(playerId, {
      id: playerId,
      name: profile.name,
      avatar: profile.avatar,
      // Streng monoton, damit die Sitzordnung auch bei gleicher Uhrzeit eindeutig ist.
      joinedAt: this.env.now() * 1000 + this.seq++,
      connected: true,
      disconnectedAt: null,
      ready: false,
      score: 0,
      chatTimes: [],
    });
    if (!this.hostId || !this.members.has(this.hostId)) this.hostId = playerId;
    this.bump();
    return OK;
  }

  updateProfile(playerId: PlayerId, profile: Profile): void {
    const m = this.members.get(playerId);
    if (!m) return;
    m.name = profile.name;
    m.avatar = profile.avatar;
    this.bump();
  }

  /** Absichtliches Verlassen. Während einer Partie: Abbruch ohne Wertung. */
  leave(playerId: PlayerId): void {
    if (!this.members.has(playerId)) return;
    if (this.hasRunningMatch && this.match!.participants.includes(playerId)) {
      this.match!.leave(playerId);
    }
    this.removeMember(playerId);
  }

  private removeMember(playerId: PlayerId): void {
    this.members.delete(playerId);
    if (this.hostId === playerId) this.reassignHost();
    this.bump();
  }

  private reassignHost(): void {
    const candidates = [...this.members.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const next = candidates.find((m) => m.connected) ?? candidates[0];
    this.hostId = next ? next.id : '';
  }

  setConnected(playerId: PlayerId, connected: boolean): void {
    const m = this.members.get(playerId);
    if (!m || m.connected === connected) return;
    m.connected = connected;
    m.disconnectedAt = connected ? null : this.env.now();
    if (this.hasRunningMatch) this.match!.setConnected(playerId, connected);
    this.bump();
  }

  // -------------------------------------------------------------------------
  // Kommandos

  handle(playerId: PlayerId, cmd: ClientCommand): CommandResult {
    const m = this.members.get(playerId);
    if (!m) return fail('no_lobby');
    const running = this.hasRunningMatch;
    let result: CommandResult;
    switch (cmd.t) {
      case 'setReady':
        if (running) return fail('wrong_phase');
        if (typeof cmd.ready !== 'boolean') return fail('bad_request');
        m.ready = cmd.ready;
        result = OK;
        break;
      case 'updateSettings':
        result = this.updateSettings(playerId, cmd.settings);
        break;
      case 'kick':
        result = this.kick(playerId, cmd.playerId);
        break;
      case 'startMatch':
        result = this.startMatch(playerId);
        break;
      case 'chat':
        result = this.postChat(m, cmd.text);
        break;
      case 'ackRole':
      case 'submitClue':
      case 'proposeVote':
      case 'withdrawSupport':
      case 'readyToVote':
      case 'castVote':
      case 'guessWord':
        if (!running) return fail('wrong_phase');
        result = this.match!.handle(playerId, cmd);
        break;
      default:
        return fail('bad_request');
    }
    if (result.ok) this.bump();
    return result;
  }

  private updateSettings(playerId: PlayerId, patch: unknown): CommandResult {
    if (playerId !== this.hostId) return fail('not_allowed');
    // Einstellungen dürfen während einer laufenden Partie nicht verändert werden.
    if (this.hasRunningMatch) return fail('wrong_phase');
    if (!patch || typeof patch !== 'object') return fail('bad_request');
    const p = patch as Record<string, unknown>;
    const next: LobbySettings = { ...this.settings, categories: [...this.settings.categories] };
    if ('categories' in p) {
      if (!Array.isArray(p.categories)) return fail('bad_request');
      const valid = CATEGORIES.map((c) => c.id).filter((id) => (p.categories as unknown[]).includes(id));
      if (valid.length === 0) return fail('bad_request');
      next.categories = valid;
    }
    if ('maxRounds' in p) {
      if (!(ROUND_OPTIONS as readonly unknown[]).includes(p.maxRounds)) return fail('bad_request');
      next.maxRounds = p.maxRounds as LobbySettings['maxRounds'];
    }
    if ('turnSeconds' in p) {
      if (!(TURN_SECONDS_OPTIONS as readonly unknown[]).includes(p.turnSeconds)) return fail('bad_request');
      next.turnSeconds = p.turnSeconds as LobbySettings['turnSeconds'];
    }
    if ('categoryHint' in p) {
      if (typeof p.categoryHint !== 'boolean') return fail('bad_request');
      next.categoryHint = p.categoryHint;
    }
    if ('scoreboard' in p) {
      if (typeof p.scoreboard !== 'boolean') return fail('bad_request');
      next.scoreboard = p.scoreboard;
    }
    const rulesChanged =
      next.maxRounds !== this.settings.maxRounds ||
      next.turnSeconds !== this.settings.turnSeconds ||
      next.categoryHint !== this.settings.categoryHint ||
      next.categories.join() !== this.settings.categories.join();
    this.settings = next;
    // Bei Regeländerungen werden Bereit-Markierungen zurückgesetzt.
    if (rulesChanged) for (const m of this.members.values()) m.ready = false;
    return OK;
  }

  private kick(hostId: PlayerId, target: unknown): CommandResult {
    if (hostId !== this.hostId) return fail('not_allowed');
    if (this.hasRunningMatch) return fail('wrong_phase');
    if (typeof target !== 'string' || target === hostId || !this.members.has(target)) {
      return fail('invalid_target');
    }
    this.banned.add(target);
    this.removeMember(target);
    return OK;
  }

  canStart(): { ok: true; participants: PlayerId[] } | { ok: false; code: 'not_enough_players' | 'not_all_ready' } {
    const connected = [...this.members.values()].filter((m) => m.connected).sort((a, b) => a.joinedAt - b.joinedAt);
    if (connected.length < LIMITS.minPlayers) return { ok: false, code: 'not_enough_players' };
    if (connected.some((m) => !m.ready)) return { ok: false, code: 'not_all_ready' };
    return { ok: true, participants: connected.map((m) => m.id) };
  }

  private startMatch(playerId: PlayerId): CommandResult {
    if (playerId !== this.hostId) return fail('not_allowed');
    if (this.hasRunningMatch) return fail('wrong_phase');
    const check = this.canStart();
    if (!check.ok) return fail(check.code);
    const ctx: MatchContext = {
      now: () => this.env.now(),
      randomInt: (n) => this.env.randomInt(n),
      newId: () => this.env.newId(),
      finish: (result) => this.onMatchFinished(result),
    };
    this.lastResult = null;
    this.match = new ClassicMatch(ctx, {
      participants: check.participants,
      settings: this.settings,
      usedWordIds: this.usedWordIds,
    });
    return OK;
  }

  private onMatchFinished(result: MatchResult): void {
    if (result.outcome === 'win') {
      for (const id of result.winners) {
        const m = this.members.get(id);
        if (m) m.score += 1;
      }
    }
    this.lastResult = result;
    this.match = null;
    for (const m of this.members.values()) m.ready = false;
    // Partie-Chat verfällt mit der Partie.
    this.chat = this.chat.filter((c) => c.channel === 'lobby');
    // Nach einem Abbruch: Host ggf. neu bestimmen.
    const host = this.members.get(this.hostId);
    if (!host || !host.connected) this.reassignHost();
    this.bump();
  }

  private chatChannelFor(playerId: PlayerId): string | null {
    if (!this.hasRunningMatch) return 'lobby';
    const match = this.match!;
    if (!match.participants.includes(playerId)) return 'lobby';
    const phase = match.publicView(playerId).phase;
    return phase === 'discussion' || phase === 'voting' ? match.id : null;
  }

  private postChat(m: Member, raw: unknown): CommandResult {
    const channel = this.chatChannelFor(m.id);
    if (!channel) return fail('wrong_phase');
    const text = sanitizeText(raw, LIMITS.chatMax);
    if (!text) return fail('empty');
    const now = this.env.now();
    m.chatTimes = m.chatTimes.filter((t) => now - t < 5000);
    if (m.chatTimes.length >= 5 || (m.chatTimes.length > 0 && now - m.chatTimes[m.chatTimes.length - 1] < 400)) {
      return fail('rate_limited');
    }
    m.chatTimes.push(now);
    this.chat.push({ id: this.env.newId(), playerId: m.id, text, at: now, channel });
    if (this.chat.length > MAX_CHAT) this.chat = this.chat.slice(-MAX_CHAT);
    return OK;
  }

  // -------------------------------------------------------------------------
  // Zeit

  nextWakeAt(): number | null {
    const times: number[] = [];
    if (this.hasRunningMatch) {
      const t = this.match!.nextWakeAt();
      if (t !== null) times.push(t);
    }
    for (const m of this.members.values()) {
      if (!m.connected && m.disconnectedAt !== null && !this.isInRunningMatch(m.id)) {
        times.push(m.disconnectedAt + TIMINGS.lobbyIdleRemoveMs);
      }
    }
    return times.length ? Math.min(...times) : null;
  }

  private isInRunningMatch(playerId: PlayerId): boolean {
    return this.hasRunningMatch && this.match!.participants.includes(playerId);
  }

  tick(): void {
    const now = this.env.now();
    if (this.hasRunningMatch) {
      const wake = this.match!.nextWakeAt();
      if (wake !== null && now >= wake) {
        this.match!.tick();
        this.bump();
      }
    }
    for (const m of [...this.members.values()]) {
      if (
        !m.connected &&
        m.disconnectedAt !== null &&
        !this.isInRunningMatch(m.id) &&
        now - m.disconnectedAt >= TIMINGS.lobbyIdleRemoveMs
      ) {
        this.removeMember(m.id);
      }
    }
  }

  abortForShutdown(): void {
    if (this.hasRunningMatch) this.match!.abort('server_restart');
  }

  // -------------------------------------------------------------------------
  // Sicht

  viewFor(playerId: PlayerId): ClientView | null {
    const me = this.members.get(playerId);
    if (!me) return null;
    const running = this.hasRunningMatch;
    const participant = running && this.match!.participants.includes(playerId);
    const channel = participant ? this.match!.id : 'lobby';
    const players = [...this.members.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        isHost: m.id === this.hostId,
        connected: m.connected,
        ready: m.ready,
        joinedAt: m.joinedAt,
        inMatch: running && this.match!.participants.includes(m.id),
        score: m.score,
      }));
    return {
      rev: this.rev,
      serverNow: this.env.now(),
      me: { id: me.id, name: me.name, avatar: me.avatar },
      lobby: {
        code: this.code,
        phase: running ? this.match!.publicView(playerId).phase : 'lobby',
        hostId: this.hostId,
        settings: { ...this.settings, categories: [...this.settings.categories] },
        players,
        chat: this.chat.filter((c) => c.channel === channel).slice(-60),
        maxPlayers: LIMITS.maxPlayers,
      },
      match: participant ? this.match!.publicView(playerId) : null,
      private: participant ? this.match!.privateView(playerId) : null,
      spectating: running && !participant,
      lastResult: this.lastResult,
    };
  }
}
