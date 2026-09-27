import * as fs from 'node:fs';
import type { Catalog } from '../gamedata/catalog';
import type { DamageWindowEntry, ProviderPlayer, ProviderSnapshot, Team } from '../shared/types';
import { Provider } from './provider';

// Live-Daten aus Overwolfs Game Events Provider (GEP) über ow-electron.
// Deadlock-Spiel-ID laut @overwolf/ow-electron-packages-types: 24482.
// Schema laut Overwolf-Doku (match_info): match_id, roster_N (JSON), items_N (JSON),
// incoming_damage (JSON, mit time_filter), match_outcome; Events: match_start, match_end, match_clock …
//
// STATUS: gegen das dokumentierte Schema implementiert und mit simulierten Events getestet.
// In der Entwicklungsumgebung konnte ow-electron nicht laufen (Windows-only Dev Mode, CDN gesperrt).
// Der Parser ist deshalb bewusst tolerant und protokolliert unbekannte Formen.

export const DEADLOCK_GAME_ID = 24482;

/** Minimale Schnittstelle der GEP-API (ow-electron `app.overwolf.packages.gep`). */
export interface GepApi {
  on(event: string, listener: (...args: any[]) => void): unknown;
  removeAllListeners?(event?: string): unknown;
  setRequiredFeatures(gameId: number, features: string[] | null | undefined): Promise<void>;
  getInfo(gameId: number): Promise<any>;
}

interface RosterEntry {
  player_name?: string; steam_id?: string | number; team_name?: string; team_id?: number | string; is_local?: boolean | string;
  hero_id?: number | string; hero_name?: string; level?: number | string; kills?: number | string; deaths?: number | string; assist?: number | string;
  assists?: number | string; hero_damage?: number | string; souls?: number | string; net_worth?: number | string;
}
interface ItemsEntry { player_name?: string; steam_id?: string | number; items?: { id?: number | string; class_name?: string; name?: string }[] }

/** Bedeutung des Feldes „souls“ – wird aus dem Verhalten bei eigenen Käufen erkannt. */
export type SoulsSemantics = 'unknown' | 'spendable' | 'networth';

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const bool = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1';
const parse = (v: unknown): any => {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return undefined; }
};

export class GepAssembler {
  roster = new Map<string, RosterEntry>();
  items = new Map<string, string[]>();
  itemsKnown = new Set<string>();
  unknownIds = new Set<string>();
  matchId: string | null = null;
  clock: number | null = null;
  ended = false;
  damage: { windowSec: number; entries: DamageWindowEntry[] } | null = null;
  semantics: SoulsSemantics = 'unknown';
  keysSeen = new Set<string>();
  notes: string[] = [];
  private lastLocalSouls: number | null = null;
  private lastLocalItems: string[] | null = null;

  constructor(private cat: Catalog) {}

  private keyOf(e: { steam_id?: string | number; player_name?: string }): string | null {
    if (e.steam_id !== undefined && e.steam_id !== '' && e.steam_id !== 0) return `sid${e.steam_id}`;
    if (e.player_name) return `name:${e.player_name}`;
    return null;
  }

  /** Verarbeitet eine GEP-Info-Aktualisierung oder ein Event. */
  handle(feature: string, key: string, value: unknown) {
    this.keysSeen.add(`${feature}.${key}`);
    if (key === 'match_id' || key === 'matchId') {
      const id = value === null || value === undefined || value === '' ? null : String(value);
      if (id !== this.matchId) this.resetMatch(id);
      return;
    }
    if (/^roster_\d+$/.test(key)) {
      const r = parse(value) as RosterEntry | undefined;
      if (!r || typeof r !== 'object') return;
      const k = this.keyOf(r);
      if (!k) return;
      this.roster.set(k, { ...(this.roster.get(k) ?? {}), ...r });
      return;
    }
    if (/^items_\d+$/.test(key)) {
      const r = parse(value) as ItemsEntry | undefined;
      if (!r || typeof r !== 'object') return;
      const k = this.keyOf(r);
      if (!k || !Array.isArray(r.items)) return;
      const list: string[] = [];
      for (const it of r.items) {
        const cls = it.class_name && this.cat.item(it.class_name) ? it.class_name
          : it.id !== undefined ? this.cat.itemById.get(Number(it.id)) : undefined;
        if (cls) list.push(cls);
        else if (it.class_name && !String(it.class_name).startsWith('upgrade_')) continue; // Fähigkeiten o. Ä.
        else this.unknownIds.add(String(it.class_name ?? it.id));
      }
      this.items.set(k, list);
      this.itemsKnown.add(k);
      return;
    }
    if (key === 'incoming_damage') {
      const d = parse(value) as { time_filter?: number; total_damage?: number; damages?: Record<string, unknown>[] } | undefined;
      if (d && Array.isArray(d.damages)) this.damage = this.parseDamage(d);
      return;
    }
    if (key === 'match_clock' || key === 'game_time' || key === 'clock') { const n = num(value); if (n !== undefined) this.clock = n; return; }
    if (key === 'match_end' || key === 'match_outcome') { this.ended = true; return; }
    if (key === 'match_start') { this.ended = false; return; }
  }

  private resetMatch(id: string | null) {
    this.matchId = id;
    this.roster.clear(); this.items.clear(); this.itemsKnown.clear();
    this.clock = null; this.ended = false; this.damage = null;
    this.lastLocalSouls = null; this.lastLocalItems = null;
    // die erkannte Semantik von „souls“ bleibt über Matches gültig
  }

  /** Schadensfenster: Einträge werden über Heldenname/Steam-ID/Spielername einem Spieler zugeordnet. */
  private parseDamage(d: { time_filter?: number; damages?: Record<string, unknown>[] }) {
    const entries: DamageWindowEntry[] = [];
    for (const e of d.damages ?? []) {
      const who = String(e.steam_id ?? e.player_name ?? e.hero_name ?? e.name ?? e.source ?? '');
      const total = num(e.damage ?? e.total ?? e.value ?? e.total_damage);
      if (!who || total === undefined) continue;
      const key = [...this.roster.entries()].find(([k, r]) => k === `sid${who}` || r.player_name === who || r.hero_name === who)?.[0];
      if (!key) continue;
      entries.push({ playerKey: key, total, bullet: num(e.bullet_damage ?? e.bullet), spirit: num(e.spirit_damage ?? e.spirit ?? e.tech_damage), melee: num(e.melee_damage ?? e.melee) });
    }
    if (!entries.length && (d.damages?.length ?? 0) > 0 && !this.notes.includes('incoming_damage: Einträge nicht zuordenbar')) this.notes.push('incoming_damage: Einträge nicht zuordenbar');
    return entries.length ? { windowSec: num(d.time_filter) ?? 30, entries } : this.damage;
  }

  /** Erkennt, ob „souls“ ausgebbar ist (sinkt beim Kauf) oder ein Gesamtwert (sinkt nie). */
  private learnSemantics(localSouls: number | undefined, localItems: string[] | null) {
    if (localSouls === undefined || !localItems) return;
    if (this.lastLocalSouls !== null && this.lastLocalItems) {
      const added = localItems.filter((i) => !this.lastLocalItems!.includes(i));
      if (added.length) {
        const price = added.reduce((s, i) => {
          const def = this.cat.item(i);
          const discount = (def?.components ?? []).filter((c) => this.lastLocalItems!.includes(c)).reduce((x, c) => x + (this.cat.item(c)?.cost ?? 0), 0);
          return s + (def?.cost ?? 0) - discount;
        }, 0);
        const drop = this.lastLocalSouls - localSouls;
        if (price > 0 && drop >= price * 0.8) this.semantics = 'spendable';
        else if (price > 0 && drop <= 0 && this.semantics === 'unknown') this.semantics = 'networth';
      }
    }
    this.lastLocalSouls = localSouls;
    this.lastLocalItems = [...localItems];
  }

  snapshot(now: number): ProviderSnapshot | null {
    if (!this.roster.size) return null;
    const entries = [...this.roster.entries()];
    const local = entries.find(([, r]) => bool(r.is_local));
    const myTeam = local ? String(local[1].team_id ?? local[1].team_name ?? '') : null;
    if (local) this.learnSemantics(num(local[1].souls), this.itemsKnown.has(local[0]) ? this.items.get(local[0]) ?? [] : null);
    const players: ProviderPlayer[] = entries.map(([k, r]) => {
      const isMe = local?.[0] === k;
      const teamRaw = String(r.team_id ?? r.team_name ?? '');
      const team: Team | undefined = myTeam === null || teamRaw === '' ? undefined : teamRaw === myTeam ? 0 : 1;
      const souls = num(r.souls);
      const netWorth = num(r.net_worth) ?? (this.semantics === 'networth' ? souls : undefined);
      return {
        key: k, isMe, team, heroClass: this.cat.heroByAnyId(r.hero_name && /^hero_/.test(r.hero_name) ? r.hero_name : undefined, num(r.hero_id)) ?? undefined,
        heroId: num(r.hero_id), name: r.player_name, level: num(r.level), kills: num(r.kills), deaths: num(r.deaths), assists: num(r.assist ?? r.assists),
        netWorth, heroDamageTotal: num(r.hero_damage),
        // ausgebbare Souls nur, wenn die Semantik belegt ist
        spendableSouls: isMe && this.semantics === 'spendable' ? souls : undefined,
        items: this.itemsKnown.has(k) ? this.items.get(k) : undefined,
        itemsComplete: this.itemsKnown.has(k),
      };
    });
    return {
      source: 'gep', matchId: this.matchId ?? 'gep-unbekannt', receivedAt: now, gameTime: this.clock,
      players, damageToMe: this.damage ?? undefined, purchasesKnown: false,
    };
  }
}

export class GepProvider extends Provider {
  readonly id = 'gep' as const;
  readonly label = 'Automatisch (Overwolf-Spielevents)';
  private asm: GepAssembler;
  private emitTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private logStream: fs.WriteStream | null = null;
  private logged = 0;
  gameRunning = false;

  constructor(cat: Catalog, private gep: GepApi, private opts: { logFile?: string } = {}) {
    super();
    this.asm = new GepAssembler(cat);
  }

  get semantics() { return this.asm.semantics; }

  start() {
    this.diag.startedAt = Date.now();
    this.setState('waiting', 'warte auf Deadlock');
    if (this.opts.logFile) { try { this.logStream = fs.createWriteStream(this.opts.logFile, { flags: 'w' }); } catch { this.logStream = null; } }
    this.gep.on('game-detected', (e: { enable?: () => void }, gameId: number, name: string) => {
      if (gameId !== DEADLOCK_GAME_ID) return;
      e?.enable?.();
      this.gameRunning = true;
      this.setState('waiting', `${name ?? 'Deadlock'} erkannt – warte auf Matchdaten`);
      void this.gep.setRequiredFeatures(DEADLOCK_GAME_ID, null).catch((err) => this.error(`setRequiredFeatures: ${String(err)}`));
      this.startPolling();
    });
    this.gep.on('elevated-privileges-required', () => {
      this.setState('error', 'Deadlock läuft als Administrator – App ebenfalls als Administrator starten');
    });
    this.gep.on('game-exit', (_e: unknown, gameId: number) => {
      if (gameId !== DEADLOCK_GAME_ID) return;
      this.gameRunning = false;
      this.stopPolling();
      this.setState('waiting', 'Deadlock beendet – warte auf nächsten Start');
    });
    this.gep.on('new-info-update', (_e: unknown, gameId: number, data: { feature?: string; key?: string; value?: unknown; category?: string }) => {
      if (gameId !== DEADLOCK_GAME_ID || !data) return;
      this.ingest(data.feature ?? data.category ?? '', data.key ?? '', data.value);
    });
    this.gep.on('new-game-event', (_e: unknown, gameId: number, data: { feature?: string; key?: string; value?: unknown }) => {
      if (gameId !== DEADLOCK_GAME_ID || !data) return;
      this.ingest(data.feature ?? '', data.key ?? '', data.value);
    });
    this.gep.on('error', (_e: unknown, _g: number, err: string) => this.error(`GEP: ${err}`));
  }

  /** Zusätzlich periodisch getInfo abfragen – falls einzelne Updates verloren gehen. */
  private startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      void this.gep.getInfo(DEADLOCK_GAME_ID).then((info) => this.ingestInfo(info)).catch(() => undefined);
    }, 5000);
  }
  private stopPolling() { if (this.pollTimer) clearInterval(this.pollTimer); this.pollTimer = null; }

  /** getInfo liefert { info: { match_info: { roster_0: …, … }, … } } oder direkt die Kategorien. */
  ingestInfo(info: any) {
    const root = info?.info ?? info?.res ?? info;
    if (!root || typeof root !== 'object') return;
    for (const [cat, vals] of Object.entries(root)) {
      if (!vals || typeof vals !== 'object') continue;
      for (const [k, v] of Object.entries(vals as Record<string, unknown>)) this.ingest(cat, k, v, false);
    }
    this.scheduleEmit();
  }

  ingest(feature: string, key: string, value: unknown, emit = true) {
    this.diag.rawEvents++;
    if (this.logStream && this.logged < 20000) { this.logStream.write(`${JSON.stringify({ t: Date.now(), feature, key, value })}\n`); this.logged++; }
    this.asm.handle(feature, key, value);
    if (emit) this.scheduleEmit();
  }

  private scheduleEmit() {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      const s = this.asm.snapshot(Date.now());
      if (!s) return;
      this.diag.unknownItemIds = [...this.asm.unknownIds].slice(0, 30).map((x) => Number(x)).filter(Number.isFinite);
      this.diag.notes = [
        `Souls-Bedeutung: ${{ unknown: 'noch unbekannt (wird beim ersten eigenen Kauf erkannt)', spendable: 'ausgebbar (gemessen)', networth: 'Gesamtwert (gemessen)' }[this.asm.semantics]}`,
        ...this.asm.notes,
      ];
      if (this.diag.state !== 'live') this.setState('live', this.asm.ended ? 'Match beendet' : 'Live-Daten');
      this.emitSnapshot(s);
    }, 250);
  }

  stop() {
    this.stopPolling();
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.gep.removeAllListeners?.('new-info-update');
    this.gep.removeAllListeners?.('new-game-event');
    this.gep.removeAllListeners?.('game-detected');
    this.gep.removeAllListeners?.('game-exit');
    this.logStream?.end();
    this.setState('idle', 'gestoppt');
  }
}
