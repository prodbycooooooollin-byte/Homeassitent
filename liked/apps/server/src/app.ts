import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { PROTOCOL_VERSION } from '@liked/protocol';
import type { ServerConfig } from './config.js';
import { createLogger, type Logger } from './logger.js';
import { RoomManager } from './rooms/room-manager.js';
import { buildView } from './rooms/view.js';
import { attachSocketHandlers } from './net/socket-handlers.js';
import { TikTokAuthService } from './auth/tiktok-auth-service.js';
import { RateLimiter } from './net/rate-limit.js';

export const SERVER_VERSION = '0.1.0';

export interface LikedServer {
  http: HttpServer;
  io: Server;
  rooms: RoomManager;
  auth: TikTokAuthService | null;
  log: Logger;
  listen(): Promise<number>;
  close(): Promise<void>;
}

/** Nachrichtengröße (Kandidaten + Index-Hashes passen deutlich darunter). */
const MAX_MESSAGE_BYTES = 96 * 1024;

export function createLikedServer(config: ServerConfig, opts: { log?: Logger; now?: () => number } = {}): LikedServer {
  const log = opts.log ?? createLogger(config.logLevel);
  const now = opts.now ?? Date.now;
  const startedAt = now();
  const httpLimiter = new RateLimiter(60, 2, now);

  const auth =
    config.tiktok && config.tokenEncryptionKey
      ? new TikTokAuthService({
          app: config.tiktok,
          dataDir: config.dataDir,
          encryptionKey: config.tokenEncryptionKey,
          log,
          now
        })
      : null;

  const clientIp = (req: import('node:http').IncomingMessage) =>
    (config.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() : '') ||
    req.socket.remoteAddress ||
    'unknown';

  const http = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const ip = clientIp(req);
      if (url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            ok: true,
            version: SERVER_VERSION,
            protocol: PROTOCOL_VERSION,
            uptimeSec: Math.round((now() - startedAt) / 1000),
            rooms: rooms.rooms.size,
            tiktokOfficialAdapter: auth ? 'configured' : 'not_configured'
          })
        );
        return;
      }
      if (url.pathname.startsWith('/api/tiktok/') || url.pathname === '/auth/tiktok/callback') {
        if (!auth) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not_configured', configured: false }));
          return;
        }
        if (!httpLimiter.take(ip)) {
          res.writeHead(429).end();
          return;
        }
        await auth.handle(req, res, url, ip);
        return;
      }
      if (url.pathname === '/join' || url.pathname.startsWith('/join/')) {
        // Beitrittslink: öffnet die installierte App über das eigene Protokoll.
        const code = (url.pathname.split('/')[2] ?? url.searchParams.get('code') ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
        res.end(`<!doctype html><meta charset="utf-8"><title>LIKED beitreten</title><body style="background:#0c0c10;color:#eee;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#a855f7">LIKED</h1><p>Raumcode</p><p style="font-size:48px;letter-spacing:.2em;color:#22d3ee">${code}</p><p><a style="color:#22d3ee" href="liked://join/${code}">In LIKED öffnen</a></p></div></body>`);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('LIKED server');
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500).end();
    });
  });

  const io = new Server(http, {
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    connectionStateRecovery: undefined,
    cors: { origin: true },
    transports: ['websocket', 'polling']
  });

  const rooms: RoomManager = new RoomManager({
    maxRooms: config.maxRooms,
    timings: config.timings,
    reconnectWindowMs: config.reconnectWindowMs,
    log,
    now,
    onChange: (room) => {
      for (const p of room.players.values()) {
        if (p.socketId) io.to(p.socketId).emit('room:state', buildView(room, p.id));
      }
    },
    onKick: (_room, player) => {
      if (player.socketId) {
        const s = io.sockets.sockets.get(player.socketId);
        s?.emit('room:kicked', { reason: 'kicked' });
        s?.leave(_room.code);
        if (s) s.data.roomCode = undefined;
      }
    }
  });

  attachSocketHandlers({ io, rooms, log, now });

  return {
    http,
    io,
    rooms,
    auth,
    log,
    listen: () =>
      new Promise((resolve) => {
        http.listen(config.port, config.host, () => {
          const addr = http.address();
          const port = typeof addr === 'object' && addr ? addr.port : config.port;
          log.info('server_listening', { port, version: SERVER_VERSION });
          resolve(port);
        });
      }),
    close: async () => {
      rooms.close();
      auth?.close();
      await new Promise<void>((r) => io.close(() => r()));
      if (http.listening) await new Promise<void>((r) => http.close(() => r()));
    }
  };
}
