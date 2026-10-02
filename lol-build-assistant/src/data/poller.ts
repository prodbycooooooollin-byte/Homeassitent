import { EventEmitter } from 'node:events';
import type { ItemDef, MatchState, PlayerState, Provenance } from '../shared/types';
import { GoldRateTracker, InventoryTracker } from './inventoryTracker';
import { LiveClient, LiveClientError, type RawActivePlayer, type RawGameStats, type RawPlayer } from './liveClient';
import { checkSchema, type FieldCheck, normalizeActive, normalizePlayer, playerId } from './normalize';

// Datenabfrage ist von Neuberechnung und Anzeige getrennt: der Poller liefert
// nur normalisierte, stabilisierte Zustände. Bei Ausfällen bleibt der letzte
// gültige Zustand erhalten (Status "stale" mit Alter) – es wird nichts erfunden.

export interface PollerOptions {
  intervalMs: number;
  staleAfterMs: number;
  endedAfterMs: number;
  versionProvider?: () => Promise<string | null>;
}

export interface PollerStats {
  polls: number;
  avgFetchMs: number;
  bytesPerPoll: number;
  lastPollAt: number | null;
}

export class LivePoller extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private last: MatchState | null = null;
  private lastSuccess = 0;
  private everLive = false;
  private tracker: InventoryTracker;
  private gold = new GoldRateTracker();
  private gameVersion: string | null = null;
  private polls = 0;
  schema: FieldCheck[] = [];

  constructor(private client: LiveClient, items: Map<number, ItemDef>, private opts: PollerOptions) {
    super();
    this.tracker = new InventoryTracker(items);
  }

  get inventoryEvents() { return this.tracker.events; }
  setItems(items: Map<number, ItemDef>) { this.tracker.setItems(items); }

  start() {
    if (this.timer) return;
    const tick = async () => {
      await this.poll();
      this.timer = setTimeout(tick, this.opts.intervalMs);
    };
    void tick();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  stats(): PollerStats {
    const m = this.client.metrics;
    return {
      polls: this.polls,
      avgFetchMs: m.requests ? m.totalMs / m.requests : 0,
      bytesPerPoll: this.polls ? m.bytes / this.polls : 0,
      lastPollAt: this.lastSuccess || null,
    };
  }

  private resetMatch() {
    this.tracker.reset();
    this.gold.reset();
    this.schema = [];
    this.gameVersion = null;
  }

  async poll(now: number = Date.now()): Promise<void> {
    this.polls++;
    try {
      const [active, players, stats] = await Promise.all([
        this.client.activePlayer(), this.client.playerList(), this.client.gameStats(),
      ]) as [RawActivePlayer, RawPlayer[], RawGameStats];
      if (!Array.isArray(players) || !players.length || !active?.championStats) {
        throw new LiveClientError('Unvollständige Antwort (Ladebildschirm)', 'not-in-game');
      }
      // Neues Spiel erkannt (Spielzeit zurückgesprungen oder anderer aktiver Spieler)?
      if (this.last && (stats.gameTime + 30 < this.last.gameTime || this.last.me.id !== playerId(active))) this.resetMatch();
      if (!this.schema.length) this.schema = checkSchema(active, players);
      // Versionsabfrage (optional, LCU) höchstens alle ~15 Polls versuchen, um den Takt nicht zu bremsen.
      if (!this.gameVersion && this.opts.versionProvider && this.polls % 15 === 1) this.gameVersion = await this.opts.versionProvider().catch(() => null);
      const prov: Provenance = { kind: 'observed', source: 'live-client', at: now, gameTime: stats.gameTime };
      const normalized: PlayerState[] = players.map((p) => {
        const n = normalizePlayer(p, prov);
        const tracked = this.tracker.update(n.id, n.items, now, stats.gameTime);
        return {
          ...n,
          items: tracked.items,
          itemsProvenance: tracked.gap
            ? { ...prov, kind: 'observed', note: 'Inventarliste unvollständig – letzter stabiler Stand' }
            : tracked.pendingRemovals.length
              ? { ...prov, note: `Entfernung unbestätigt: ${tracked.pendingRemovals.join(', ')}` }
              : prov,
        };
      });
      const me = normalizeActive(active, prov);
      this.gold.add(stats.gameTime, me.gold);
      const rate = this.gold.rate();
      this.last = {
        mode: 'live',
        feed: { status: 'live', lastSuccessAt: now },
        gameTime: stats.gameTime,
        gameMode: stats.gameMode,
        mapNumber: stats.mapNumber,
        gameVersion: this.gameVersion,
        gameVersionProvenance: this.gameVersion
          ? { kind: 'observed', source: 'live-client', at: now, note: 'über optionale LCU-Abfrage' }
          : { kind: 'unknown', source: 'live-client', at: now, note: 'Live Client Data liefert keine Spielversion' },
        me,
        players: normalized,
        goldRate: rate !== null ? { value: rate, provenance: { kind: 'derived', source: 'live-client', at: now } } : undefined,
      };
      this.lastSuccess = now;
      this.everLive = true;
      this.emit('state', this.last);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (!this.everLive || !this.last) {
        this.emit('waiting', err);
        return;
      }
      const age = now - this.lastSuccess;
      const status = age > this.opts.endedAfterMs ? 'ended' : age > this.opts.staleAfterMs ? 'stale' : 'live';
      const state: MatchState = { ...this.last, feed: { status, lastSuccessAt: this.lastSuccess, lastErrorAt: now, error: err } };
      if (status === 'ended') { this.everLive = false; this.last = null; this.resetMatch(); }
      this.emit('state', state);
    }
  }
}
