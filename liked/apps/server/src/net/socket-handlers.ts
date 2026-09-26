import type { Server, Socket } from 'socket.io';
import { C2S, PROTOCOL_VERSION, type Ack, type ErrorCode } from '@liked/protocol';
import type { z } from 'zod';
import type { RoomManager } from '../rooms/room-manager.js';
import type { Room } from '../rooms/room.js';
import { RateLimiter } from './rate-limit.js';
import type { Logger } from '../logger.js';

interface SocketData {
  roomCode?: string;
  playerId?: string;
  ip: string;
}

type AckFn = (res: Ack<Record<string, unknown>>) => void;

export interface HandlerDeps {
  io: Server;
  rooms: RoomManager;
  log: Logger;
  now: () => number;
  /** Nur hinter einem vertrauenswürdigen Reverse Proxy: Client-IP aus X-Forwarded-For. */
  trustProxy?: boolean;
}

export function attachSocketHandlers({ io, rooms, log, now, trustProxy = false }: HandlerDeps): { limiters: RateLimiter[] } {
  // Gesamtbudget je Socket und zusätzlich je Ereignistyp, damit z. B. Reaktionen
  // niemals Stimmen oder Wiedergabemeldungen verdrängen.
  const perSocket = new RateLimiter(80, 15, now);
  const perEvent = new RateLimiter(20, 4, now);
  // Raumbeitritt/-erstellung: 10 Versuche, 1 alle 6 s je IP (Schutz gegen Code-Raten).
  const joinPerIp = new RateLimiter(10, 1 / 6, now);
  const sweep = setInterval(() => {
    perSocket.sweep();
    perEvent.sweep();
    joinPerIp.sweep();
  }, 60_000);
  sweep.unref();

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketData;
    const forwarded = trustProxy ? String(socket.handshake.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() : '';
    data.ip = forwarded || String(socket.handshake.address ?? 'unknown');

    const roomOf = (): Room | null => (data.roomCode ? rooms.get(data.roomCode) ?? null : null);

    /** Validiert Nutzdaten, Rate-Limit und liefert immer eine Ack-Antwort. */
    function on<K extends keyof typeof C2S>(
      event: K,
      handler: (payload: z.infer<(typeof C2S)[K]>, ack: AckFn) => void,
      opts: { joinLimit?: boolean } = {}
    ) {
      socket.on(event as string, (raw: unknown, maybeAck?: unknown) => {
        const ack: AckFn = typeof maybeAck === 'function' ? (maybeAck as AckFn) : () => undefined;
        const critical = event === 'vote' || event === 'playback' || event === 'playerStatus' || event === 'timeSync';
        if (
          !perEvent.take(`${socket.id}:${event}`) ||
          (!critical && !perSocket.take(socket.id)) ||
          (opts.joinLimit && !joinPerIp.take(data.ip))
        ) {
          return ack({ ok: false, error: 'rate_limited' });
        }
        const parsed = C2S[event].safeParse(raw ?? {});
        if (!parsed.success) return ack({ ok: false, error: 'invalid_payload' });
        try {
          handler(parsed.data as never, ack);
        } catch (err) {
          log.error('handler_error', { code: String(event), error: err instanceof Error ? err.message : 'unknown' });
          ack({ ok: false, error: 'invalid_payload' });
        }
      });
    }

    const fail = (ack: AckFn, error: ErrorCode | null, extra: Record<string, unknown> = {}) =>
      error ? ack({ ok: false, error }) : ack({ ok: true, ...extra });

    const inRoom = (ack: AckFn, fn: (room: Room, playerId: string) => void) => {
      const room = roomOf();
      if (!room || !data.playerId || !room.players.has(data.playerId)) return ack({ ok: false, error: 'not_in_room' });
      fn(room, data.playerId);
    };

    const leaveCurrent = () => {
      const room = roomOf();
      if (room && data.playerId) room.disconnect(data.playerId, socket.id);
      if (data.roomCode) socket.leave(data.roomCode);
      data.roomCode = undefined;
      data.playerId = undefined;
    };

    on('timeSync', (p, ack) => ack({ ok: true, t0: p.t0, serverTime: now() }));

    on(
      'createRoom',
      (p, ack) => {
        if (p.protocolVersion !== PROTOCOL_VERSION) return ack({ ok: false, error: 'protocol_mismatch' });
        leaveCurrent();
        const room = rooms.create(p.mode);
        if (!room) return ack({ ok: false, error: 'room_limit' });
        const res = room.addPlayer(p.profile, socket.id);
        if ('error' in res) return ack({ ok: false, error: res.error });
        data.roomCode = room.code;
        data.playerId = res.player.id;
        socket.join(room.code);
        ack({ ok: true, roomCode: room.code, playerId: res.player.id, token: res.token, indexSalt: room.indexSalt, mode: room.mode });
        room.touchBroadcast();
      },
      { joinLimit: true }
    );

    on(
      'joinRoom',
      (p, ack) => {
        if (p.protocolVersion !== PROTOCOL_VERSION) return ack({ ok: false, error: 'protocol_mismatch' });
        const room = rooms.get(p.code);
        if (!room) return ack({ ok: false, error: 'room_not_found' });
        leaveCurrent();
        const res = room.addPlayer(p.profile, socket.id);
        if ('error' in res) return ack({ ok: false, error: res.error });
        data.roomCode = room.code;
        data.playerId = res.player.id;
        socket.join(room.code);
        ack({ ok: true, roomCode: room.code, playerId: res.player.id, token: res.token, indexSalt: room.indexSalt, mode: room.mode });
        room.touchBroadcast();
      },
      { joinLimit: true }
    );

    on(
      'resumeRoom',
      (p, ack) => {
        const room = rooms.get(p.code);
        const player = room?.findByToken(p.token);
        if (!room || !player) return ack({ ok: false, error: 'invalid_token' });
        // Alte Verbindung dieses Spielers trennen (nur eine aktive Sitzung).
        if (player.socketId && player.socketId !== socket.id) io.sockets.sockets.get(player.socketId)?.disconnect(true);
        data.roomCode = room.code;
        data.playerId = player.id;
        socket.join(room.code);
        room.resume(player, socket.id);
        ack({ ok: true, roomCode: room.code, playerId: player.id, token: p.token, indexSalt: room.indexSalt, mode: room.mode });
        room.touchBroadcast();
      },
      { joinLimit: true }
    );

    on('leaveRoom', (_p, ack) =>
      inRoom(ack, (room, id) => {
        socket.leave(room.code);
        data.roomCode = undefined;
        data.playerId = undefined;
        room.removePlayer(id, 'left');
        ack({ ok: true });
      })
    );

    on('updateSettings', (p, ack) => inRoom(ack, (room, id) => fail(ack, room.updateSettings(id, p))));
    on('setReady', (p, ack) => inRoom(ack, (room, id) => fail(ack, room.setReady(id, p.ready))));
    on('submitPool', (p, ack) => inRoom(ack, (room, id) => fail(ack, room.submitPool(id, p))));
    on('mediaCheck', (p, ack) =>
      inRoom(ack, (room, id) => {
        room.setMediaCheck(id, p.ok);
        ack({ ok: true });
      })
    );
    on('kick', (p, ack) => inRoom(ack, (room, id) => fail(ack, room.kick(id, p.playerId))));
    on('start', (_p, ack) => inRoom(ack, (room, id) => fail(ack, room.start(id))));
    on('react', (p, ack) =>
      inRoom(ack, (room, id) => {
        room.react();
        io.to(room.code).emit('room:reaction', { id: `${id}:${now()}`, playerId: id, emoji: p.emoji });
        ack({ ok: true });
      })
    );
    on('playerStatus', (p, ack) => inRoom(ack, (room, id) => fail(ack, room.playerStatus(id, p.roundId, p.status))));
    on('playback', (p, ack) => inRoom(ack, (room, id) => fail(ack, room.playback(id, p.roundId, p.kind))));
    on('vote', (p, ack) =>
      inRoom(ack, (room, id) => {
        const res = room.vote(id, p.roundId, p.targetId, p.voteId);
        if (!res.ok) return ack({ ok: false, error: res.error });
        ack({ ok: true, vote: { targetId: res.targetId, voteId: res.voteId, confirmed: true } });
      })
    );
    on('hostPause', (p, ack) => inRoom(ack, (room, id) => fail(ack, room.hostPause(id, p.paused))));
    on('rematch', (_p, ack) => inRoom(ack, (room, id) => fail(ack, room.toLobby(id))));
    on('toLobby', (_p, ack) => inRoom(ack, (room, id) => fail(ack, room.toLobby(id))));

    socket.on('disconnect', () => {
      perSocket.forget(socket.id);
      const room = roomOf();
      if (room && data.playerId) room.disconnect(data.playerId, socket.id);
    });
  });

  return { limiters: [perSocket, perEvent, joinPerIp] };
}
