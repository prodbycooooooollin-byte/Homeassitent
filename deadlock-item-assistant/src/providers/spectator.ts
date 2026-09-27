import type { Catalog } from '../gamedata/catalog';
import type { ProviderPlayer, ProviderSnapshot, Team } from '../shared/types';
import { Provider } from './provider';

// Spectator-Provider für den Deadlock-API-Live-Events-Dienst (SSE, Open Source,
// github.com/deadlock-api/deadlock-api/tree/master/live-events). Der Dienst schaut
// das Match über Valves Spectator-/Broadcast-System zu und parst die Demo-Daten.
//
// WICHTIG (verifiziert aus dem Quellcode, nicht aus einem echten Match):
//  - net_worth = m_iGoldNetWorth → Gesamtwert, NICHT ausgebbare Souls. Budget bleibt „unbekannt“.
//  - upgrades  = m_vecUpgrades   → Liste von IDs; Zuordnung zu Items per ID-Tabelle (unbestätigt).
//  - Kein Schaden gegen mich, keine Kaufzeitpunkte: neue Items heißen „neu erkannt“.
//  - Broadcast-Daten sind gegenüber dem Spiel verzögert (Größe hier nicht gemessen).

export interface SpectatorConfig {
  /** Basis-URL des Live-Events-Dienstes, z. B. http://localhost:3000 (selbst gehostet per Docker) */
  baseUrl: string;
  matchId: string;
  /** Eigene Steam-Account-ID (SteamID3, 32 Bit) zur Erkennung des eigenen Spielers */
  myAccountId: number | null;
  /** min. Abstand zwischen Snapshots (ms) */
  throttleMs?: number;
}

interface ControllerState {
  steam_id?: number; steam_name?: string; team?: number; hero_id?: number; net_worth?: number;
  kills?: number; deaths?: number; assists?: number; hero_damage?: number; upgrades?: (number | string)[];
}

/** Teamnummern im Spiel: 2 und 3 (Amber/Sapphire). Normalisiert auf 0/1. */
export const normalizeTeam = (t: number | undefined): Team | undefined => (t === 2 ? 0 : t === 3 ? 1 : undefined);

/** Wandelt Live-Events in normalisierte Snapshots um (ohne Netzwerk – testbar). */
export class SpectatorAssembler {
  private controllers = new Map<number, ControllerState>();
  private flexByTeam: Partial<Record<Team, number>> = {};
  gameTime: number | null = null;
  gameStartTime: number | null = null;
  unknownIds = new Set<number>();
  sawUpgradesField = false;
  eventsSeen = 0;

  constructor(private cat: Catalog, private cfg: Pick<SpectatorConfig, 'matchId' | 'myAccountId'>) {}

  handle(eventName: string, data: Record<string, unknown>) {
    this.eventsSeen++;
    if (typeof data.game_time === 'number') {
      // Spielzeit relativ zum Matchstart, falls bekannt
      this.gameTime = this.gameStartTime !== null ? Math.max(0, data.game_time - this.gameStartTime) : data.game_time;
    }
    const type = String(data.entity_type ?? eventName.replace(/_entity_(created|updated|deleted)$/, ''));
    const idx = typeof data.entity_index === 'number' ? data.entity_index : -1;
    if (type === 'game_rules_proxy' && typeof data.game_start_time === 'number' && data.game_start_time > 0) this.gameStartTime = data.game_start_time;
    if (type === 'player_controller' && idx >= 0) {
      if (/_deleted$/.test(eventName)) { this.controllers.delete(idx); return; }
      const cur = this.controllers.get(idx) ?? {};
      for (const k of ['steam_id', 'steam_name', 'team', 'hero_id', 'net_worth', 'kills', 'deaths', 'assists', 'hero_damage'] as const) {
        if (data[k] !== undefined && data[k] !== null) (cur as Record<string, unknown>)[k] = data[k];
      }
      if (Array.isArray(data.upgrades)) { cur.upgrades = data.upgrades as (number | string)[]; this.sawUpgradesField = true; }
      this.controllers.set(idx, cur);
    }
    if (type === 'team' && typeof data.team === 'number' && typeof data.flex_unlocked === 'number') {
      const t = normalizeTeam(data.team);
      if (t !== undefined) this.flexByTeam[t] = data.flex_unlocked;
    }
  }

  mapItems(ids: (number | string)[]): { items: string[]; unknown: number[] } {
    const items: string[] = [];
    const unknown: number[] = [];
    for (const raw of ids) {
      // u64 aus dem Parser; die Item-ID steckt (Annahme) in den unteren 32 Bit
      const n = Number(BigInt.asUintN(32, BigInt(raw)));
      const cls = this.cat.itemById.get(n);
      if (cls) items.push(cls); else { unknown.push(n); this.unknownIds.add(n); }
    }
    return { items, unknown };
  }

  snapshot(now: number): ProviderSnapshot | null {
    if (!this.controllers.size) return null;
    const players: ProviderPlayer[] = [];
    for (const [idx, c] of this.controllers) {
      if (c.hero_id === undefined || c.hero_id === 0) continue;
      const heroClass = this.cat.heroByAnyId(undefined, c.hero_id) ?? undefined;
      const mapped = c.upgrades ? this.mapItems(c.upgrades) : null;
      players.push({
        key: c.steam_id ? `acc${c.steam_id}` : `ent${idx}`,
        isMe: this.cfg.myAccountId !== null && c.steam_id === this.cfg.myAccountId,
        team: normalizeTeam(c.team), heroClass, heroId: c.hero_id, name: c.steam_name,
        kills: c.kills, deaths: c.deaths, assists: c.assists, netWorth: c.net_worth,
        heroDamageTotal: c.hero_damage,
        // Items nur, wenn das Feld tatsächlich geliefert wurde (sonst unbekannt, nicht leer)
        items: mapped?.items, itemsComplete: mapped !== null && mapped.unknown.length === 0,
        unknownItemIds: mapped?.unknown,
      });
    }
    return {
      source: 'spectator', matchId: this.cfg.matchId, receivedAt: now, gameTime: this.gameTime, players,
      extraSlotsByTeam: { ...this.flexByTeam }, purchasesKnown: false,
    };
  }
}

/** Minimaler SSE-Zeilenparser (benannte Events). */
export class SseParser {
  private buf = '';
  private event = 'message';
  private data: string[] = [];
  constructor(private onEvent: (name: string, data: string) => void) {}
  push(chunk: string) {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).replace(/\r$/, '');
      this.buf = this.buf.slice(nl + 1);
      if (line === '') { if (this.data.length) this.onEvent(this.event, this.data.join('\n')); this.event = 'message'; this.data = []; continue; }
      if (line.startsWith(':')) continue;
      const i = line.indexOf(':');
      const field = i < 0 ? line : line.slice(0, i);
      const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
      if (field === 'event') this.event = value;
      else if (field === 'data') this.data.push(value);
    }
  }
}

export class SpectatorProvider extends Provider {
  readonly id = 'spectator' as const;
  readonly label = 'Spectator-Stream (Deadlock API Live Events)';
  private abort: AbortController | null = null;
  private assembler: SpectatorAssembler;
  private lastEmit = 0;
  private retry = 0;
  private stopped = true;
  private timer: NodeJS.Timeout | null = null;

  constructor(cat: Catalog, private cfg: SpectatorConfig, private fetchImpl: typeof fetch = fetch) {
    super();
    this.assembler = new SpectatorAssembler(cat, cfg);
  }

  start() {
    this.stopped = false;
    this.diag.startedAt = Date.now();
    this.diag.notes = [
      'net_worth ist der Gesamtwert (m_iGoldNetWorth), nicht das ausgebbare Budget.',
      'Keine Kaufzeitpunkte und kein Schaden gegen dich in dieser Quelle.',
      'Broadcast-Daten sind gegenüber dem Spiel verzögert.',
    ];
    void this.connect();
  }

  stop() {
    this.stopped = true;
    this.abort?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.setState('idle', 'gestoppt');
  }

  private async connect() {
    if (this.stopped) return;
    const url = `${this.cfg.baseUrl.replace(/\/$/, '')}/v1/matches/${encodeURIComponent(this.cfg.matchId)}/live/demo/events?subscribed_entities=player_controller,team,game_rules_proxy`;
    this.setState('connecting', url);
    this.abort = new AbortController();
    try {
      const res = await this.fetchImpl(url, { signal: this.abort.signal, headers: { accept: 'text/event-stream' } });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      this.setState('waiting', 'verbunden – warte auf Demo-Daten');
      this.retry = 0;
      const parser = new SseParser((name, data) => this.onEvent(name, data));
      const decoder = new TextDecoder();
      const reader = res.body.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      if (!this.stopped && this.diag.state !== 'ended') throw new Error('Stream beendet');
    } catch (e) {
      if (this.stopped) return;
      this.error(String((e as Error).message ?? e));
      // begrenzte Wiederholung mit Warteabstand
      this.retry++;
      if (this.retry > 8) { this.setState('error', 'zu viele Fehlversuche – bitte Einstellungen prüfen'); return; }
      const wait = Math.min(30_000, 1000 * 2 ** (this.retry - 1));
      this.setState('error', `Verbindung fehlgeschlagen, neuer Versuch in ${Math.round(wait / 1000)} s`);
      this.timer = setTimeout(() => void this.connect(), wait);
    }
  }

  private onEvent(name: string, raw: string) {
    this.diag.rawEvents++;
    if (name === 'end') { this.setState('ended', 'Match-Stream beendet'); this.abort?.abort(); return; }
    if (name === 'message') return; // Verbindungsmeldung
    let data: Record<string, unknown>;
    try { data = JSON.parse(raw) as Record<string, unknown>; } catch { return; }
    this.assembler.handle(name, data);
    const now = Date.now();
    if ((name === 'tick_end' || /player_controller/.test(name)) && now - this.lastEmit >= (this.cfg.throttleMs ?? 1000)) {
      const s = this.assembler.snapshot(now);
      if (s) {
        this.lastEmit = now;
        if (this.diag.state !== 'live') this.setState('live', 'Daten empfangen');
        if (!this.assembler.sawUpgradesField && !this.diag.notes.includes('Keine Item-Liste im Stream erhalten.')) this.diag.notes.push('Keine Item-Liste im Stream erhalten.');
        if (this.cfg.myAccountId !== null && !s.players.some((p) => p.isMe)) this.diag.detail = 'Eigene Account-ID nicht im Match gefunden';
        this.diag.unknownItemIds = [...this.assembler.unknownIds].slice(0, 30);
        this.emitSnapshot(s);
      }
    }
  }
}

/** Optionaler Helfer: sucht das eigene Match in den aktiven Matches (nur Top-200 der „Zuschauen“-Liste!). */
export async function findActiveMatch(accountId: number, fetchImpl: typeof fetch = fetch, apiBase = 'https://api.deadlock-api.com'): Promise<{ matchId: string | null; note: string }> {
  const res = await fetchImpl(`${apiBase}/v1/matches/active?account_ids=${accountId}`);
  if (!res.ok) return { matchId: null, note: `HTTP ${res.status}` };
  const list = await res.json() as { match_id?: number }[];
  if (!list.length) return { matchId: null, note: 'Nicht in den aktiven Top-Matches gefunden (die API sieht nur die ~200 meistgesehenen Matches).' };
  return { matchId: String(list[0].match_id), note: 'gefunden' };
}
