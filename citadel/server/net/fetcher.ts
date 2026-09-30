// Kontrollierter HTTP-Abruf für die Recherche:
//  - nur http/https, nur Ports 80/443
//  - DNS-Auflösung wird beim Verbindungsaufbau geprüft (keine privaten/lokalen/internen Ziele, kein DNS-Rebinding-Loch)
//  - Redirects manuell (max. 5), jede Station erneut geprüft
//  - Größenlimit, Timeout, erlaubte Content-Types
//  - Rate-Limit pro Host, bedingte Anfragen (ETag/Last-Modified), Inhalts-Hash
//  - optional robots.txt

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import type { Db } from '../db.ts';
import { get, nowIso, run } from '../db.ts';

export class FetchError extends Error {
  constructor(
    message: string,
    public code: 'blocked-target' | 'http' | 'too-large' | 'content-type' | 'timeout' | 'network' | 'robots' | 'redirects',
    public status?: number,
    public retryAfterS?: number,
  ) {
    super(message);
  }
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::' || l === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
    if (mapped) return isPrivateAddress(mapped[1]);
    return l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb') || l.startsWith('ff') || l.startsWith('64:ff9b');
  }
  return true;
}

export interface FetchOptions {
  accept?: string;
  headers?: Record<string, string>;
  /** Mindestabstand zwischen Anfragen an denselben Host in ms. */
  minIntervalMs?: number;
  maxBytes?: number;
  timeoutMs?: number;
  allowedTypes?: RegExp;
  conditional?: boolean;
  respectRobots?: boolean;
}

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  notModified: boolean;
  body: string;
  contentHash: string;
  contentType: string;
  fetchedAt: string;
}

const lastRequestAt = new Map<string, number>();
const robotsCache = new Map<string, { at: number; disallow: string[] }>();

export interface FetcherDeps {
  db: Db;
  userAgent: string;
  allowPrivate: boolean;
  defaultMaxBytes: number;
  /** Nur Tests: skaliert alle Mindestabstände (0 = keine Wartezeit). */
  throttleScale?: number;
}

export class Fetcher {
  constructor(private deps: FetcherDeps) {}

  private safeLookup = (hostname: string, options: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err, '', 0);
      const list = addrs as dns.LookupAddress[];
      const bad = list.find((a) => isPrivateAddress(a.address));
      if (bad && !this.deps.allowPrivate) return cb(Object.assign(new Error(`Ziel ${hostname} löst auf interne Adresse ${bad.address} auf – blockiert`), { code: 'EBLOCKED' }), '', 0);
      if (options.all) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    });
  };

  private checkUrl(raw: string): URL {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new FetchError(`Ungültige URL: ${raw}`, 'blocked-target');
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new FetchError(`Protokoll ${u.protocol} nicht erlaubt`, 'blocked-target');
    if (u.username || u.password) throw new FetchError('URLs mit Zugangsdaten sind nicht erlaubt', 'blocked-target');
    const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
    if (!this.deps.allowPrivate && port !== 443 && port !== 80) throw new FetchError(`Port ${port} nicht erlaubt`, 'blocked-target');
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && isPrivateAddress(host) && !this.deps.allowPrivate) throw new FetchError(`Interne Adresse ${host} blockiert`, 'blocked-target');
    if (!this.deps.allowPrivate && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local'))) throw new FetchError(`Host ${host} blockiert`, 'blocked-target');
    return u;
  }

  private async throttle(host: string, minIntervalMs: number) {
    const last = lastRequestAt.get(host) || 0;
    const wait = last + minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt.set(host, Date.now());
  }

  private once(u: URL, headers: Record<string, string>, maxBytes: number, timeoutMs: number): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
    const mod = u.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = mod.request(
        u,
        { method: 'GET', headers: { 'user-agent': this.deps.userAgent, 'accept-encoding': 'gzip, deflate, br', ...headers }, lookup: this.safeLookup as never, timeout: timeoutMs },
        (res) => {
          const enc = String(res.headers['content-encoding'] || '').toLowerCase();
          let stream: NodeJS.ReadableStream = res;
          if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
          else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
          else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
          const chunks: Buffer[] = [];
          let size = 0;
          stream.on('data', (c: Buffer) => {
            size += c.length;
            if (size > maxBytes) {
              req.destroy();
              reject(new FetchError(`Antwort größer als ${maxBytes} Bytes`, 'too-large'));
              return;
            }
            chunks.push(c);
          });
          stream.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
          stream.on('error', (e) => reject(new FetchError(`Dekodierfehler: ${e.message}`, 'network')));
        },
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new FetchError(`Zeitüberschreitung nach ${timeoutMs} ms`, 'timeout'));
      });
      req.on('error', (e: NodeJS.ErrnoException) => {
        if (e.code === 'EBLOCKED') reject(new FetchError(e.message, 'blocked-target'));
        else reject(new FetchError(`Netzwerkfehler: ${e.message}`, 'network'));
      });
      req.end();
    });
  }

  private async robotsAllowed(u: URL): Promise<boolean> {
    const key = u.origin;
    let entry = robotsCache.get(key);
    if (!entry || Date.now() - entry.at > 24 * 3600_000) {
      let disallow: string[] = [];
      try {
        const r = await this.once(new URL('/robots.txt', u.origin), { accept: 'text/plain' }, 200_000, 10_000);
        if (r.status === 200) disallow = parseRobots(r.body.toString('utf8'), this.deps.userAgent);
      } catch {
        disallow = [];
      }
      entry = { at: Date.now(), disallow };
      robotsCache.set(key, entry);
    }
    return !entry.disallow.some((p) => p && u.pathname.startsWith(p));
  }

  async fetch(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
    const maxBytes = opts.maxBytes ?? this.deps.defaultMaxBytes;
    const timeoutMs = opts.timeoutMs ?? 20_000;
    const allowed = opts.allowedTypes ?? /^(text\/|application\/(json|xml|x-yaml)|application\/octet-stream)/i;
    let u = this.checkUrl(url);
    if (opts.respectRobots && !(await this.robotsAllowed(u))) throw new FetchError(`robots.txt verbietet ${u.pathname}`, 'robots');
    const cached = opts.conditional !== false ? get<{ etag: string | null; last_modified: string | null; body: string | null; content_hash: string | null; final_url: string | null }>(this.deps.db, 'SELECT etag, last_modified, body, content_hash, final_url FROM fetch_cache WHERE url = ?', url) : undefined;
    const headers: Record<string, string> = { accept: opts.accept || '*/*', ...(opts.headers || {}) };
    if (cached?.etag) headers['if-none-match'] = cached.etag;
    if (cached?.last_modified) headers['if-modified-since'] = cached.last_modified;

    for (let hop = 0; hop <= 5; hop++) {
      await this.throttle(u.host, (opts.minIntervalMs ?? 1000) * (this.deps.throttleScale ?? 1));
      const r = await this.once(u, headers, maxBytes, timeoutMs);
      if (r.status >= 300 && r.status < 400 && r.status !== 304) {
        const loc = r.headers.location;
        if (!loc) throw new FetchError(`Redirect ohne Ziel (${r.status})`, 'http', r.status);
        u = this.checkUrl(new URL(loc, u).toString());
        delete headers['if-none-match'];
        delete headers['if-modified-since'];
        continue;
      }
      if (r.status === 304 && cached?.body != null) {
        run(this.deps.db, 'UPDATE fetch_cache SET fetched_at = ?, http_status = 304 WHERE url = ?', nowIso(), url);
        return { url, finalUrl: cached.final_url || url, status: 304, notModified: true, body: cached.body, contentHash: cached.content_hash || '', contentType: '', fetchedAt: nowIso() };
      }
      if (r.status === 429 || r.status === 503) {
        const ra = Number(r.headers['retry-after']);
        throw new FetchError(`HTTP ${r.status} (Rate-Limit/Überlast)`, 'http', r.status, Number.isFinite(ra) ? ra : undefined);
      }
      if (r.status < 200 || r.status >= 300) throw new FetchError(`HTTP ${r.status} für ${u}`, 'http', r.status);
      const ct = String(r.headers['content-type'] || 'application/octet-stream');
      if (!allowed.test(ct)) throw new FetchError(`Inhaltstyp ${ct} nicht erlaubt`, 'content-type');
      const body = r.body.toString('utf8');
      const contentHash = createHash('sha256').update(r.body).digest('hex');
      const fetchedAt = nowIso();
      run(
        this.deps.db,
        `INSERT INTO fetch_cache(url, final_url, etag, last_modified, content_hash, http_status, fetched_at, body) VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(url) DO UPDATE SET final_url=excluded.final_url, etag=excluded.etag, last_modified=excluded.last_modified, content_hash=excluded.content_hash, http_status=excluded.http_status, fetched_at=excluded.fetched_at, body=excluded.body`,
        url,
        u.toString(),
        (r.headers.etag as string) || null,
        (r.headers['last-modified'] as string) || null,
        contentHash,
        r.status,
        fetchedAt,
        body.length <= 1_000_000 ? body : null,
      );
      return { url, finalUrl: u.toString(), status: r.status, notModified: cached?.content_hash === contentHash, body, contentHash, contentType: ct, fetchedAt };
    }
    throw new FetchError('Zu viele Weiterleitungen', 'redirects');
  }

  async json<T>(url: string, opts: FetchOptions = {}): Promise<{ data: T; result: FetchResult }> {
    const result = await this.fetch(url, { accept: 'application/json', ...opts });
    try {
      return { data: JSON.parse(result.body) as T, result };
    } catch {
      throw new FetchError(`Antwort von ${url} ist kein JSON`, 'content-type');
    }
  }
}

export function parseRobots(text: string, userAgent: string): string[] {
  const ua = userAgent.split('/')[0].toLowerCase();
  const groups: { agents: string[]; disallow: string[] }[] = [];
  let cur: { agents: string[]; disallow: string[] } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase();
    if (k === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], disallow: [] };
        groups.push(cur);
      }
      cur.agents.push(m[2].toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && k === 'disallow') cur.disallow.push(m[2]);
    }
  }
  const specific = groups.find((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  return (specific || groups.find((g) => g.agents.includes('*')))?.disallow || [];
}
