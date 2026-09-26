import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type RoomMode } from '@liked/protocol';
import { Room, type RoomDeps } from './room.js';
import { anon, type Logger } from '../logger.js';
import type { Timings } from '../config.js';

export interface RoomManagerOptions {
  maxRooms: number;
  timings: Timings;
  reconnectWindowMs: number;
  log: Logger;
  now?: () => number;
  onChange: RoomDeps['onChange'];
  onKick: RoomDeps['onKick'];
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout;
  private readonly now: () => number;

  constructor(private readonly opts: RoomManagerOptions) {
    this.now = opts.now ?? Date.now;
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  private newCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(0, ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Kein freier Raumcode');
  }

  create(mode: RoomMode): Room | null {
    if (this.rooms.size >= this.opts.maxRooms) return null;
    const room = new Room(this.newCode(), mode, {
      now: this.now,
      timings: this.opts.timings,
      reconnectWindowMs: this.opts.reconnectWindowMs,
      log: this.opts.log,
      onChange: this.opts.onChange,
      onKick: this.opts.onKick,
      onEmpty: (r) => this.remove(r, 'empty')
    });
    this.rooms.set(room.code, room);
    this.opts.log.info('room_created', { room: anon(room.id), rooms: this.rooms.size });
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  remove(room: Room, reason: string): void {
    room.close();
    if (this.rooms.get(room.code) === room) this.rooms.delete(room.code);
    this.opts.log.info('room_removed', { room: anon(room.id), reason, rooms: this.rooms.size });
  }

  /**
   * Kurzlebige Daten: Räume ohne Aktivität oder mit alten Ergebnissen werden
   * entfernt. Da Räume nur im Speicher liegen, verschwinden sie auch bei einem
   * Prozessneustart vollständig.
   */
  sweep(): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      const noneConnected = [...room.players.values()].every((p) => !p.connected);
      const idle = now - room.lastActivity;
      if (noneConnected && idle > this.opts.reconnectWindowMs + 5_000) this.remove(room, 'abandoned');
      else if (room.resultsAt && now - room.resultsAt > this.opts.timings.resultsTtlMs) this.remove(room, 'results_expired');
      else if (idle > this.opts.timings.roomIdleTtlMs) this.remove(room, 'idle');
    }
  }

  close(): void {
    clearInterval(this.sweeper);
    for (const room of [...this.rooms.values()]) this.remove(room, 'shutdown');
  }
}
