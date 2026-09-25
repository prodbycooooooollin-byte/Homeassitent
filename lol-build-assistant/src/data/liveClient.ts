import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';

// Adapter für die dokumentierte, lokale Live Client Data API
// (https://127.0.0.1:2999/liveclientdata/...). Nur lesend, nur localhost.
// Kein Memory Reading, keine Injection, keine Eingaben ins Spiel.

export interface LiveClientOptions {
  baseUrl?: string;
  /** Pfad zum Riot-Root-Zertifikat (riotgames.pem). Ohne Datei: TLS-Prüfung nur für 127.0.0.1 gelockert. */
  caFile?: string;
  timeoutMs?: number;
}

export class LiveClientError extends Error {
  constructor(message: string, readonly code: 'offline' | 'not-in-game' | 'timeout' | 'http' | 'parse') {
    super(message);
  }
}

export interface FetchMetrics {
  requests: number;
  failures: number;
  bytes: number;
  totalMs: number;
  lastMs: number;
}

export class LiveClient {
  private base: URL;
  private agent: https.Agent | undefined;
  private timeoutMs: number;
  readonly metrics: FetchMetrics = { requests: 0, failures: 0, bytes: 0, totalMs: 0, lastMs: 0 };
  readonly tlsMode: 'riot-ca' | 'localhost-relaxed' | 'http';

  constructor(opts: LiveClientOptions = {}) {
    this.base = new URL(opts.baseUrl ?? 'https://127.0.0.1:2999');
    const host = this.base.hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new Error('Die Live Client Data API darf nur über localhost angesprochen werden.');
    }
    this.timeoutMs = opts.timeoutMs ?? 1500;
    if (this.base.protocol === 'https:') {
      if (opts.caFile && fs.existsSync(opts.caFile)) {
        this.agent = new https.Agent({ ca: fs.readFileSync(opts.caFile), keepAlive: true, checkServerIdentity: () => undefined });
        this.tlsMode = 'riot-ca';
      } else {
        // Der Spielclient nutzt ein selbstsigniertes Zertifikat. Ohne riotgames.pem
        // wird die Prüfung ausschließlich für diese localhost-Verbindung gelockert.
        this.agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
        this.tlsMode = 'localhost-relaxed';
      }
    } else this.tlsMode = 'http';
  }

  getJson<T>(path: string): Promise<T> {
    const url = new URL(path, this.base);
    const lib = url.protocol === 'https:' ? https : http;
    const started = Date.now();
    this.metrics.requests++;
    return new Promise<T>((resolve, reject) => {
      const req = lib.get(url, { agent: this.agent, timeout: this.timeoutMs }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          this.metrics.bytes += body.length;
          this.metrics.lastMs = Date.now() - started;
          this.metrics.totalMs += this.metrics.lastMs;
          if (res.statusCode === 404) { this.metrics.failures++; return reject(new LiveClientError('Keine laufende Partie (404)', 'not-in-game')); }
          if (!res.statusCode || res.statusCode >= 400) { this.metrics.failures++; return reject(new LiveClientError(`HTTP ${res.statusCode}`, 'http')); }
          try { resolve(JSON.parse(body.toString('utf8')) as T); } catch {
            this.metrics.failures++; reject(new LiveClientError('Antwort ist kein gültiges JSON (Ladebildschirm?)', 'parse'));
          }
        });
      });
      req.on('timeout', () => { req.destroy(); this.metrics.failures++; reject(new LiveClientError('Zeitüberschreitung', 'timeout')); });
      req.on('error', (e: NodeJS.ErrnoException) => {
        this.metrics.failures++;
        reject(new LiveClientError(e.code === 'ECONNREFUSED' ? 'Spielclient nicht erreichbar' : e.message, 'offline'));
      });
    });
  }

  allGameData() { return this.getJson<RawAllGameData>('/liveclientdata/allgamedata'); }
  activePlayer() { return this.getJson<RawActivePlayer>('/liveclientdata/activeplayer'); }
  playerList() { return this.getJson<RawPlayer[]>('/liveclientdata/playerlist'); }
  gameStats() { return this.getJson<RawGameStats>('/liveclientdata/gamestats'); }
}

// ---------------------------------------------------------------------------
// Rohschema (wie dokumentiert; zur Laufzeit per Schema-Prüfung verifiziert)
// ---------------------------------------------------------------------------

export interface RawItem {
  itemID: number; count: number; slot: number; displayName?: string; price?: number;
  canUse?: boolean; consumable?: boolean; rawDisplayName?: string;
}

export interface RawPlayer {
  championName: string;
  rawChampionName?: string;
  riotId?: string;
  riotIdGameName?: string;
  summonerName?: string;
  team: 'ORDER' | 'CHAOS';
  position?: string;
  level: number;
  isBot?: boolean;
  isDead?: boolean;
  items: RawItem[];
  scores?: { kills: number; deaths: number; assists: number; creepScore: number; wardScore?: number };
  runes?: { keystone?: { displayName?: string } };
}

export interface RawChampionStats {
  abilityHaste?: number; abilityPower?: number; armor?: number; armorPenetrationFlat?: number;
  armorPenetrationPercent?: number; attackDamage?: number; attackRange?: number; attackSpeed?: number;
  bonusArmorPenetrationPercent?: number; bonusMagicPenetrationPercent?: number; critChance?: number;
  critDamage?: number; currentHealth?: number; lifeSteal?: number; magicLethality?: number;
  magicPenetrationFlat?: number; magicPenetrationPercent?: number; magicResist?: number; maxHealth?: number;
  moveSpeed?: number; physicalLethality?: number; resourceMax?: number; resourceType?: string;
  omnivamp?: number; spellVamp?: number; tenacity?: number;
}

export interface RawActivePlayer {
  riotId?: string;
  riotIdGameName?: string;
  summonerName?: string;
  level: number;
  currentGold: number;
  championStats: RawChampionStats;
  abilities?: Record<string, { abilityLevel?: number }>;
}

export interface RawGameStats {
  gameMode: string; gameTime: number; mapName?: string; mapNumber: number; mapTerrain?: string;
}

export interface RawAllGameData {
  activePlayer: RawActivePlayer;
  allPlayers: RawPlayer[];
  gameData: RawGameStats;
  events?: unknown;
}
