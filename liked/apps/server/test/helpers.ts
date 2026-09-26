import { io as connect, type Socket } from 'socket.io-client';
import { PROTOCOL_VERSION, type RoomView, type PoolSubmission } from '@liked/protocol';
import { demoLikes } from '@liked/tiktok-connectors';
import { createLikedServer, type LikedServer } from '../src/app.js';
import { loadConfig, type ServerConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';

export function testConfig(over: Partial<ServerConfig> = {}): ServerConfig {
  const base = loadConfig({ PORT: '0', HOST: '127.0.0.1', LOG_LEVEL: 'debug' } as NodeJS.ProcessEnv);
  return {
    ...base,
    reconnectWindowMs: 600,
    timings: {
      ...base.timings,
      preparingTimeoutMs: 500,
      preparingRetryMs: 300,
      countdownMs: 60,
      allVotedGraceMs: 30,
      revealMs: 40,
      scoreboardMs: 40,
      maxStartDelayMs: 400,
      maxBufferingMs: 150,
      maxTotalBufferingMs: 400,
      maxHostPauseMs: 500
    },
    ...over
  };
}

export async function startServer(over: Partial<ServerConfig> = {}) {
  const log = createLogger('debug', () => undefined);
  const server = createLikedServer(testConfig(over), { log });
  const port = await server.listen();
  return { server, port, url: `http://127.0.0.1:${port}` };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until<T>(fn: () => T | undefined | null | false, timeoutMs = 5000, label = 'Bedingung'): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout: ${label}`);
    await sleep(5);
  }
}

let deviceCounter = 0;

export class Bot {
  socket: Socket;
  view: RoomView | null = null;
  views: RoomView[] = [];
  playerId = '';
  token = '';
  code = '';
  salt = '';
  reactions: unknown[] = [];
  kicked = false;
  /** Automatik: Laden melden, Wiedergabe melden, abstimmen. */
  auto = true;
  failLoad = false;
  choose: ((view: RoomView) => string | null) | null = null;
  private handledRounds = new Set<string>();
  private startedRounds = new Set<string>();
  private votedRounds = new Set<string>();

  constructor(
    readonly url: string,
    readonly name: string
  ) {
    this.socket = this.makeSocket();
  }

  private makeSocket(): Socket {
    const s = connect(this.url, { transports: ['websocket'], forceNew: true, reconnection: false });
    s.on('room:state', (v: RoomView) => {
      if (this.view && v.roomId === this.view.roomId && v.version < this.view.version) return;
      this.view = v;
      this.views.push(v);
      if (this.auto) this.react(v);
    });
    s.on('room:reaction', (r) => this.reactions.push(r));
    s.on('room:kicked', () => {
      this.kicked = true;
    });
    return s;
  }

  async connected() {
    if (!this.socket.connected) await new Promise<void>((r) => this.socket.once('connect', () => r()));
  }

  emit<T = Record<string, unknown>>(event: string, payload: unknown = {}): Promise<{ ok: boolean; error?: string } & T> {
    return new Promise((resolve) => this.socket.emit(event, payload, resolve));
  }

  profile() {
    return { name: this.name, avatar: 'fox', deviceId: `device_${this.name.replace(/[^A-Za-z0-9]/g, 'x')}_${++deviceCounter}_abcdefgh` };
  }

  async create(mode: 'demo' | 'tiktok' = 'demo') {
    await this.connected();
    const r = await this.emit<{ roomCode: string; playerId: string; token: string; indexSalt: string }>('createRoom', {
      profile: this.profile(),
      mode,
      protocolVersion: PROTOCOL_VERSION
    });
    if (!r.ok) throw new Error(r.error);
    Object.assign(this, { code: r.roomCode, playerId: r.playerId, token: r.token, salt: r.indexSalt });
    return r;
  }

  async join(code: string) {
    await this.connected();
    const r = await this.emit<{ roomCode: string; playerId: string; token: string; indexSalt: string }>('joinRoom', {
      code,
      profile: this.profile(),
      protocolVersion: PROTOCOL_VERSION
    });
    if (!r.ok) throw new Error(r.error);
    Object.assign(this, { code: r.roomCode, playerId: r.playerId, token: r.token, salt: r.indexSalt });
    return r;
  }

  pool(count = 12, seed = this.name): PoolSubmission {
    return {
      source: 'demo',
      candidates: demoLikes(`${seed}-${this.code}`, count).map((l) => ({ videoId: l.videoId, likedAt: l.likedAt })),
      indexHashes: [],
      totalAvailable: count
    };
  }

  async prepareLobby(count = 12) {
    expectOk(await this.emit('submitPool', this.pool(count)));
    expectOk(await this.emit('mediaCheck', { ok: true }));
    expectOk(await this.emit('setReady', { ready: true }));
  }

  react(v: RoomView) {
    const r = v.round;
    if (!r) return;
    const key = `${r.roundId}:${r.loadAttempt}`;
    if (v.phase === 'PREPARING' && !this.handledRounds.has(key)) {
      this.handledRounds.add(key);
      void this.emit('playerStatus', { roundId: r.roundId, status: this.failLoad ? 'failed' : 'ready', reason: this.failLoad ? 'unavailable' : undefined });
    }
    if (v.phase === 'PLAYING_AND_VOTING' && !this.startedRounds.has(r.roundId)) {
      this.startedRounds.add(r.roundId);
      void this.emit('playback', { roundId: r.roundId, kind: 'started', position: 0 });
    }
    if (v.phase === 'PLAYING_AND_VOTING' && r.you.role === 'voter' && !this.votedRounds.has(r.roundId) && this.choose) {
      const target = this.choose(v);
      if (target) {
        this.votedRounds.add(r.roundId);
        void this.emit('vote', { roundId: r.roundId, targetId: target, voteId: `v_${r.roundId.slice(3, 20)}_${this.name}` });
      }
    }
  }

  async disconnect() {
    this.socket.disconnect();
    await sleep(20);
  }

  async reconnect() {
    this.socket = this.makeSocket();
    await this.connected();
    return this.emit('resumeRoom', { code: this.code, token: this.token });
  }

  close() {
    this.socket.disconnect();
  }
}

export function expectOk(r: { ok: boolean; error?: string }) {
  if (!r.ok) throw new Error(`Erwartet ok, erhalten: ${r.error}`);
}

export async function lobbyOf(url: string, n: number) {
  const bots = Array.from({ length: n }, (_, i) => new Bot(url, `Spieler${i + 1}`));
  await bots[0]!.create('demo');
  for (const b of bots.slice(1)) await b.join(bots[0]!.code);
  return bots;
}

export type Srv = LikedServer;
