import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  AVATAR_COUNT,
  ERROR_MESSAGES,
  LIMITS,
  LOBBY_CODE_ALPHABET,
  PROTOCOL_VERSION,
  normalizeLobbyCode,
  sanitizeText,
  type ClientCommand,
  type ClientMessage,
  type ErrorCode,
  type PlayerId,
  type Profile,
  type ServerMessage,
} from '../shared/protocol.ts';
import { Lobby, type LobbyEnv } from './lobby.ts';

export interface GameServerOptions {
  port?: number;
  host?: string;
  /** Verzeichnis mit dem gebauten Web-Client (optional) */
  staticDir?: string | null;
  now?: () => number;
  log?: (msg: string) => void;
  /** Maximale gleichzeitige Verbindungen pro IP (Schutz vor Missbrauch) */
  maxConnectionsPerIp?: number;
  /** Maximale Anzahl gleichzeitiger Lobbys */
  maxLobbies?: number;
  /** X-Forwarded-For auswerten (nur hinter einem vertrauenswürdigen Reverse Proxy) */
  trustProxy?: boolean;
}

interface Session {
  token: string;
  playerId: PlayerId;
  profile: Profile;
  lobbyCode: string | null;
  socket: WebSocket | null;
  lastSeen: number;
  /** Idempotenz: bereits verarbeitete Aktions-IDs → Antwort */
  actions: Map<string, ServerMessage>;
}

const ACTION_CACHE = 200;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const HELLO_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 15_000;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

export function sanitizeProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const name = sanitizeText(p.name, LIMITS.nameMax);
  const avatar = typeof p.avatar === 'number' && Number.isInteger(p.avatar) ? p.avatar : -1;
  if (!name || avatar < 0 || avatar >= AVATAR_COUNT) return null;
  return { name, avatar };
}

/** Einfacher Token-Bucket gegen Nachrichten-Spam pro Verbindung. */
class RateLimiter {
  private tokens: number;
  private last: number;
  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
    private readonly now: () => number,
  ) {
    this.tokens = capacity;
    this.last = now();
  }
  take(): boolean {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.perSecond);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export class GameServer {
  readonly http: Server;
  private readonly wss: WebSocketServer;
  private readonly sessions = new Map<string, Session>();
  private readonly byPlayer = new Map<PlayerId, Session>();
  readonly lobbies = new Map<string, Lobby>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly sentRev = new Map<string, number>();
  private readonly now: () => number;
  private readonly log: (msg: string) => void;
  private readonly staticDir: string | null;
  private readonly env: LobbyEnv;
  private readonly alive = new WeakMap<WebSocket, boolean>();
  private readonly perIp = new Map<string, number>();
  private readonly maxPerIp: number;
  private readonly maxLobbies: number;
  private readonly trustProxy: boolean;
  private heartbeat: NodeJS.Timeout | null = null;
  private stopping = false;
  private gc: NodeJS.Timeout | null = null;

  constructor(opts: GameServerOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m) => console.log(`[impostor] ${m}`));
    this.staticDir = opts.staticDir && existsSync(join(opts.staticDir, 'index.html')) ? resolve(opts.staticDir) : null;
    this.env = { now: this.now, randomInt: (n) => randomInt(n), newId: () => randomUUID() };
    this.http = createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.maxMessageBytes });
    this.maxPerIp = opts.maxConnectionsPerIp ?? 40;
    this.maxLobbies = opts.maxLobbies ?? 2000;
    this.trustProxy = opts.trustProxy ?? false;
    this.http.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }
      const ip = this.clientIp(req);
      const count = this.perIp.get(ip) ?? 0;
      if (count >= this.maxPerIp) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.perIp.set(ip, (this.perIp.get(ip) ?? 0) + 1);
        ws.once('close', () => {
          const n = (this.perIp.get(ip) ?? 1) - 1;
          if (n <= 0) this.perIp.delete(ip);
          else this.perIp.set(ip, n);
        });
        this.onConnection(ws);
      });
    });
  }

  listen(port: number, host = '0.0.0.0'): Promise<number> {
    this.heartbeat = setInterval(() => this.sweepSockets(), HEARTBEAT_MS);
    this.gc = setInterval(() => this.collectSessions(), 10 * 60 * 1000);
    return new Promise((res) => {
      this.http.listen(port, host, () => {
        const addr = this.http.address();
        res(typeof addr === 'object' && addr ? addr.port : port);
      });
    });
  }

  /** Beendet laufende Partien nachvollziehbar ohne Wertung und schließt alle Verbindungen. */
  async shutdown(): Promise<void> {
    this.stopping = true;
    for (const lobby of this.lobbies.values()) {
      lobby.abortForShutdown();
      this.afterChange(lobby);
    }
    for (const s of this.sessions.values()) {
      if (s.socket) {
        this.send(s.socket, {
          type: 'notice',
          kind: 'server_shutdown',
          message: 'Der Server wird neu gestartet. Laufende Partien enden ohne Wertung.',
        });
        s.socket.close(1012, 'restart');
      }
    }
    for (const t of this.timers.values()) clearTimeout(t);
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.gc) clearInterval(this.gc);
    await new Promise((res) => setTimeout(res, 150));
    for (const ws of this.wss.clients) ws.terminate();
    this.wss.close();
    this.http.closeAllConnections();
    await new Promise<void>((res) => this.http.close(() => res()));
  }

  private clientIp(req: IncomingMessage): string {
    if (this.trustProxy) {
      const fwd = req.headers['x-forwarded-for'];
      const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
      if (first) return first;
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  // -------------------------------------------------------------------------
  // HTTP

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, lobbies: this.lobbies.size }));
      return;
    }
    if (!this.staticDir || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Impostor-Spielserver. WebSocket-Endpunkt: /ws');
      return;
    }
    let file = normalize(join(this.staticDir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(this.staticDir)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(this.staticDir, 'index.html');
    const ext = extname(file);
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy':
        "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'",
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  }

  // -------------------------------------------------------------------------
  // WebSocket

  private onConnection(ws: WebSocket): void {
    let session: Session | null = null;
    const limiter = new RateLimiter(30, 12, this.now);
    this.alive.set(ws, true);
    ws.on('pong', () => this.alive.set(ws, true));
    const helloTimer = setTimeout(() => {
      if (!session) ws.close(4000, 'hello timeout');
    }, HELLO_TIMEOUT_MS);

    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (!limiter.take()) {
        if (msg.type === 'cmd' && typeof msg.actionId === 'string') {
          this.send(ws, {
            type: 'ack',
            actionId: msg.actionId.slice(0, 64),
            ok: false,
            code: 'rate_limited',
            message: ERROR_MESSAGES.rate_limited,
          });
        }
        return;
      }
      if (msg.type === 'ping') {
        const clientTime = typeof msg.clientTime === 'number' ? msg.clientTime : 0;
        this.send(ws, { type: 'pong', clientTime, serverNow: this.now() });
        return;
      }
      if (msg.type === 'hello') {
        if (session) return;
        clearTimeout(helloTimer);
        session = this.onHello(ws, msg);
        return;
      }
      if (msg.type === 'cmd' && session && session.socket === ws) {
        this.onCommand(session, msg.actionId, msg.cmd);
      }
    });

    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (session && session.socket === ws) this.onDisconnect(session);
    });
    ws.on('error', () => {});
  }

  private sweepSockets(): void {
    for (const ws of this.wss.clients) {
      if (this.alive.get(ws) === false) {
        // Tote Verbindung schnell erkennen, damit die Pause sofort greift.
        ws.terminate();
        continue;
      }
      this.alive.set(ws, false);
      try {
        ws.ping();
      } catch {
        /* ignorieren */
      }
    }
  }

  private collectSessions(): void {
    const now = this.now();
    for (const [token, s] of this.sessions) {
      const inLobby = s.lobbyCode !== null && this.lobbies.get(s.lobbyCode)?.has(s.playerId);
      if (!s.socket && !inLobby && now - s.lastSeen > SESSION_TTL_MS) {
        this.sessions.delete(token);
        this.byPlayer.delete(s.playerId);
      }
    }
  }

  private onHello(ws: WebSocket, msg: Extract<ClientMessage, { type: 'hello' }>): Session | null {
    const profile = sanitizeProfile(msg.profile);
    if (msg.protocol !== PROTOCOL_VERSION || !profile) {
      ws.close(4001, 'bad hello');
      return null;
    }
    const token = typeof msg.token === 'string' && msg.token.length <= 64 ? msg.token : null;
    let session = token ? this.sessions.get(token) : undefined;
    const sessionReset = token !== null && !session;
    if (!session) {
      session = {
        token: randomBytes(24).toString('base64url'),
        playerId: randomUUID(),
        profile,
        lobbyCode: null,
        socket: null,
        lastSeen: this.now(),
        actions: new Map(),
      };
      this.sessions.set(session.token, session);
      this.byPlayer.set(session.playerId, session);
    }
    if (session.socket && session.socket !== ws) {
      this.send(session.socket, {
        type: 'notice',
        kind: 'replaced',
        message: 'Diese Sitzung wurde in einem anderen Fenster geöffnet.',
      });
      const old = session.socket;
      session.socket = null;
      old.close(4002, 'replaced');
    }
    session.socket = ws;
    session.lastSeen = this.now();
    this.send(ws, {
      type: 'welcome',
      token: session.token,
      playerId: session.playerId,
      serverNow: this.now(),
      sessionReset,
      webClient: this.staticDir !== null,
    });
    const lobby = session.lobbyCode ? this.lobbies.get(session.lobbyCode) : undefined;
    if (lobby && lobby.has(session.playerId)) {
      lobby.setConnected(session.playerId, true);
      this.afterChange(lobby);
    } else {
      session.lobbyCode = null;
      this.send(ws, { type: 'state', view: null });
    }
    return session;
  }

  private onDisconnect(session: Session): void {
    session.socket = null;
    session.lastSeen = this.now();
    const lobby = session.lobbyCode ? this.lobbies.get(session.lobbyCode) : undefined;
    if (lobby) {
      lobby.setConnected(session.playerId, false);
      this.afterChange(lobby);
    }
  }

  private onCommand(session: Session, actionId: unknown, cmd: unknown): void {
    if (typeof actionId !== 'string' || actionId.length === 0 || actionId.length > 64) return;
    const cached = session.actions.get(actionId);
    if (cached) {
      // Netzwerk-Retry / Doppelklick: dieselbe Antwort, keine zweite Ausführung.
      this.sendTo(session, cached);
      return;
    }
    let result: { ok: true } | { ok: false; code: ErrorCode };
    if (!cmd || typeof cmd !== 'object' || typeof (cmd as { t?: unknown }).t !== 'string') {
      result = { ok: false, code: 'bad_request' };
    } else {
      result = this.execute(session, cmd as ClientCommand);
    }
    const ack: ServerMessage = result.ok
      ? { type: 'ack', actionId, ok: true }
      : { type: 'ack', actionId, ok: false, code: result.code, message: ERROR_MESSAGES[result.code] };
    session.actions.set(actionId, ack);
    if (session.actions.size > ACTION_CACHE) {
      const first = session.actions.keys().next().value;
      if (first !== undefined) session.actions.delete(first);
    }
    this.sendTo(session, ack);
    session.lastSeen = this.now();
  }

  private execute(session: Session, cmd: ClientCommand): { ok: true } | { ok: false; code: ErrorCode } {
    const current = session.lobbyCode ? this.lobbies.get(session.lobbyCode) : undefined;
    switch (cmd.t) {
      case 'createLobby': {
        if (this.lobbies.size >= this.maxLobbies) return { ok: false, code: 'rate_limited' };
        if (current) this.leaveLobby(session, current);
        const lobby = new Lobby(this.newCode(), this.env);
        this.lobbies.set(lobby.code, lobby);
        lobby.join(session.playerId, session.profile);
        session.lobbyCode = lobby.code;
        this.log(`Lobby erstellt (${this.lobbies.size} aktiv)`);
        this.afterChange(lobby);
        return { ok: true };
      }
      case 'joinLobby': {
        const code = normalizeLobbyCode(typeof cmd.code === 'string' ? cmd.code : '');
        const lobby = this.lobbies.get(code);
        if (!lobby) return { ok: false, code: 'not_found' };
        if (current && current !== lobby) this.leaveLobby(session, current);
        const r = lobby.join(session.playerId, session.profile);
        if (!r.ok) return r;
        session.lobbyCode = lobby.code;
        this.afterChange(lobby);
        return { ok: true };
      }
      case 'leaveLobby': {
        if (!current) return { ok: false, code: 'no_lobby' };
        this.leaveLobby(session, current);
        return { ok: true };
      }
      case 'setProfile': {
        const profile = sanitizeProfile(cmd.profile);
        if (!profile) return { ok: false, code: 'bad_request' };
        session.profile = profile;
        if (current) {
          current.updateProfile(session.playerId, profile);
          this.afterChange(current);
        }
        return { ok: true };
      }
      default: {
        if (!current) return { ok: false, code: 'no_lobby' };
        const before = new Set(current.memberIds());
        const r = current.handle(session.playerId, cmd);
        // Entfernte Personen (Kick) informieren.
        for (const id of before) {
          if (!current.has(id)) {
            const s = this.byPlayer.get(id);
            if (s) {
              s.lobbyCode = null;
              this.sendTo(s, { type: 'notice', kind: 'kicked', message: ERROR_MESSAGES.kicked });
              this.sendTo(s, { type: 'state', view: null });
            }
          }
        }
        this.afterChange(current);
        return r;
      }
    }
  }

  private leaveLobby(session: Session, lobby: Lobby): void {
    lobby.leave(session.playerId);
    session.lobbyCode = null;
    this.sendTo(session, { type: 'state', view: null });
    this.afterChange(lobby);
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < LIMITS.lobbyCodeLength; i++) code += LOBBY_CODE_ALPHABET[randomInt(LOBBY_CODE_ALPHABET.length)];
      if (!this.lobbies.has(code)) return code;
    }
  }

  /** Nach jeder Änderung: leere Lobby löschen, Sichten verteilen, Timer neu setzen. */
  private afterChange(lobby: Lobby): void {
    if (lobby.isEmpty) {
      const t = this.timers.get(lobby.code);
      if (t) clearTimeout(t);
      this.timers.delete(lobby.code);
      this.lobbies.delete(lobby.code);
      this.sentRev.delete(lobby.code);
      this.log(`Lobby geschlossen (${this.lobbies.size} aktiv)`);
      return;
    }
    if (this.sentRev.get(lobby.code) !== lobby.rev) {
      this.sentRev.set(lobby.code, lobby.rev);
      this.broadcast(lobby);
    }
    this.reschedule(lobby);
  }

  private broadcast(lobby: Lobby): void {
    for (const id of lobby.memberIds()) {
      const s = this.byPlayer.get(id);
      if (!s?.socket) continue;
      // Jede Person erhält ausschließlich ihre persönliche Sicht.
      this.send(s.socket, { type: 'state', view: lobby.viewFor(id) });
    }
  }

  /** Aktuelle Sicht erneut an eine Person senden (z. B. nach Reconnect). */
  resend(playerId: PlayerId): void {
    const s = this.byPlayer.get(playerId);
    const lobby = s?.lobbyCode ? this.lobbies.get(s.lobbyCode) : undefined;
    if (s?.socket && lobby) this.send(s.socket, { type: 'state', view: lobby.viewFor(playerId) });
  }

  private reschedule(lobby: Lobby): void {
    const existing = this.timers.get(lobby.code);
    if (existing) clearTimeout(existing);
    this.timers.delete(lobby.code);
    const at = lobby.nextWakeAt();
    if (at === null || this.stopping) return;
    const delay = Math.max(0, at - this.now()) + 5;
    this.timers.set(
      lobby.code,
      setTimeout(() => {
        this.timers.delete(lobby.code);
        if (this.lobbies.get(lobby.code) !== lobby) return;
        lobby.tick();
        this.afterChange(lobby);
      }, delay),
    );
  }

  private sendTo(session: Session, msg: ServerMessage): void {
    if (session.socket) this.send(session.socket, msg);
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }
}
