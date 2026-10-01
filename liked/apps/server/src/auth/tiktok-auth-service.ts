import { createHash, randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  extractLikesFromArchiveFile,
  TikTokApiError,
  TikTokPortabilityClient,
  type TikTokAppConfig
} from '@liked/tiktok-connectors/node';
import { TokenStore, type AuthRecord } from './token-store.js';
import { RateLimiter } from '../net/rate-limit.js';
import type { Logger } from '../logger.js';

/**
 * Getrennter Authentifizierungsdienst für den OFFIZIELLEN Adapter
 * (TikTok Login Kit + Data Portability API).
 *
 * Ablauf:
 *  1. Desktop ruft POST /api/tiktok/login mit einem zufälligen Geräte-Geheimnis
 *     (Bearer) auf und erhält die TikTok-Autorisierungs-URL (im System-Browser geöffnet).
 *  2a. Web-Modus: TikTok leitet auf /auth/tiktok/callback um; der Server tauscht den Code
 *      mit dem Client-Secret (bleibt hier) gegen Tokens und speichert sie verschlüsselt.
 *  2b. Desktop-Modus (Login Kit for Desktop, Redirect auf http://localhost:PORT/callback/, Port als „*“ registriert):
 *      Die Desktop-App öffnet kurz einen lokalen Empfänger, nimmt Code und State entgegen
 *      und reicht sie per POST /api/tiktok/complete an den Server weiter. Der Server tauscht
 *      den Code (mit PKCE-Verifier und Client-Secret) – Tokens verlassen ihn auch hier nie.
 *  3. POST /api/tiktok/sync startet eine Datenanfrage (Kategorie „activity“).
 *     Die Bereitstellung ist asynchron; der Server prüft mit Backoff.
 *  4. Ist das Archiv bereit, wird es als Datenstrom in eine kurzlebige Datei geladen,
 *     nur die „Like List“ extrahiert und die Datei sofort gelöscht.
 *  5. GET /api/tiktok/likes liefert die IDs einmalig an das Gerät; danach verfallen sie.
 * Tokens verlassen diesen Dienst nie (weder Räume noch Clients noch Logs).
 */
export interface AuthServiceOptions {
  app: Omit<TikTokAppConfig, 'fetchImpl'> & { fetchImpl?: typeof fetch };
  dataDir: string;
  encryptionKey: Buffer;
  log: Logger;
  now?: () => number;
  /** Erste Statusprüfung und Backoff-Grenzen (ms). */
  pollInitialMs?: number;
  pollMaxMs?: number;
  maxSyncDurationMs?: number;
  maxArchiveBytes?: number;
  /** Kodierung der PKCE-Challenge im Desktop-Modus (TikTok: hex). */
  pkceEncoding?: 'hex' | 'base64url';
}

interface PendingLogin {
  recordId: string;
  expiresAt: number;
  redirectUri: string;
  codeVerifier: string | null;
}

/** Desktop-Redirect (Login Kit for Desktop): Loopback-Adresse, Port ggf. als Platzhalter „*“. */
export function isLoopbackRedirect(uri: string): boolean {
  try {
    const u = new URL(uri.replace(':*', ':1'));
    return u.protocol === 'http:' || u.protocol === 'https:' ? ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) : false;
  } catch {
    return false;
  }
}

/** Setzt den vom Gerät gewählten Port in das Muster ein; feste Ports bleiben unverändert. */
export function loopbackRedirectFor(pattern: string, port: number | undefined): string | null {
  if (!pattern.includes(':*')) return pattern;
  if (!Number.isInteger(port) || port! < 1024 || port! > 65535) return null;
  return pattern.replace(':*', `:${port}`);
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const LIKES_TTL_MS = 24 * 3_600_000;
const MAX_IDLE_MS = 90 * 24 * 3_600_000;

export class TikTokAuthService {
  readonly client: TikTokPortabilityClient;
  readonly store: TokenStore;
  private pendingStates = new Map<string, PendingLogin>();
  private jobs = new Map<string, NodeJS.Timeout>();
  private readonly limiter: RateLimiter;
  private readonly now: () => number;
  private readonly sweeper: NodeJS.Timeout;

  constructor(private readonly opts: AuthServiceOptions) {
    this.now = opts.now ?? Date.now;
    this.client = new TikTokPortabilityClient(opts.app);
    this.store = new TokenStore(opts.dataDir, opts.encryptionKey);
    this.limiter = new RateLimiter(30, 0.5, this.now);
    this.store.purge(this.now(), MAX_IDLE_MS);
    // Laufende Synchronisierungen nach einem Neustart fortsetzen.
    for (const r of this.store.all()) if (r.state === 'syncing' && r.sync.requestId) this.scheduleCheck(r.id, 5_000);
    this.sweeper = setInterval(() => {
      this.store.purge(this.now(), MAX_IDLE_MS);
      for (const [s, v] of this.pendingStates) if (v.expiresAt < this.now()) this.pendingStates.delete(s);
      this.limiter.sweep();
    }, 10 * 60_000);
    this.sweeper.unref();
  }

  close(): void {
    clearInterval(this.sweeper);
    for (const t of this.jobs.values()) clearTimeout(t);
    this.jobs.clear();
  }

  private blank(id: string): AuthRecord {
    const now = this.now();
    return {
      id,
      createdAt: now,
      lastSeenAt: now,
      tokens: null,
      displayName: null,
      state: 'authorizing',
      error: null,
      sync: { requestId: null, stage: null, startedAt: null, nextCheckAt: null, attempt: 0, completedAt: null },
      likes: null,
      likesExpireAt: null
    };
  }

  /* ---------------------------------------------------------- */
  /* HTTP                                                        */
  /* ---------------------------------------------------------- */

  /** „desktop“, wenn die Redirect-URL eine Loopback-Adresse ist (Login Kit for Desktop). */
  get loginMode(): 'web' | 'desktop' {
    return isLoopbackRedirect(this.opts.app.redirectUri) ? 'desktop' : 'web';
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL, ip: string): Promise<boolean> {
    const isCallback = isCallbackPath(url.pathname);
    if (!url.pathname.startsWith('/api/tiktok/') && !isCallback) return false;
    if (!this.limiter.take(ip)) {
      json(res, 429, { error: 'rate_limited' });
      return true;
    }
    if (isCallback && req.method === 'GET') {
      await this.callback(url, res);
      return true;
    }
    const secret = bearer(req);
    if (!secret) {
      json(res, 401, { error: 'missing_device_secret' });
      return true;
    }
    const id = sha(secret);
    try {
      switch (`${req.method} ${url.pathname}`) {
        case 'POST /api/tiktok/login': {
          const r = this.login(id, await readJson(req));
          return json(res, 'error' in r ? 400 : 200, r), true;
        }
        case 'POST /api/tiktok/complete': {
          const r = await this.complete(id, await readJson(req));
          return json(res, r.ok ? 200 : 400, r), true;
        }
        case 'GET /api/tiktok/status':
          return json(res, 200, this.status(id)), true;
        case 'POST /api/tiktok/sync':
          return json(res, 202, await this.startSync(id)), true;
        case 'POST /api/tiktok/sync/cancel':
          return json(res, 200, await this.cancelSync(id)), true;
        case 'GET /api/tiktok/likes':
          return json(res, 200, this.takeLikes(id)), true;
        case 'DELETE /api/tiktok/connection':
          return json(res, 200, await this.disconnect(id)), true;
        default:
          return json(res, 404, { error: 'not_found' }), true;
      }
    } catch (err) {
      this.opts.log.warn('auth_error', { error: err instanceof Error ? err.message.slice(0, 60) : 'unknown' });
      json(res, 500, { error: 'internal' });
      return true;
    }
  }

  login(
    id: string,
    body: Record<string, unknown> = {}
  ): { authorizeUrl: string; mode: 'web' | 'desktop'; redirectUri: string } | { error: string } {
    let redirectUri = this.opts.app.redirectUri;
    let codeVerifier: string | null = null;
    let codeChallenge: string | undefined;
    if (this.loginMode === 'desktop') {
      const port = typeof body.loopbackPort === 'number' ? body.loopbackPort : undefined;
      const concrete = loopbackRedirectFor(redirectUri, port);
      if (!concrete) return { error: 'loopback_port_required' };
      redirectUri = concrete;
      codeVerifier = randomBytes(48).toString('base64url');
      const digest = createHash('sha256').update(codeVerifier);
      codeChallenge = this.opts.pkceEncoding === 'base64url' ? digest.digest('base64url') : digest.digest('hex');
    }
    const rec = this.store.get(id) ?? this.blank(id);
    if (!rec.tokens) rec.state = 'authorizing';
    rec.lastSeenAt = this.now();
    this.store.upsert(rec);
    const state = randomBytes(24).toString('base64url');
    this.pendingStates.set(state, { recordId: id, expiresAt: this.now() + 10 * 60_000, redirectUri, codeVerifier });
    return { authorizeUrl: this.client.authorizeUrl(state, { redirectUri, codeChallenge }), mode: this.loginMode, redirectUri };
  }

  /** Desktop-Modus: Code und State, die der lokale Empfänger der App erhalten hat. */
  async complete(id: string, body: Record<string, unknown>): Promise<{ ok: boolean; state?: string; error?: string }> {
    const state = typeof body.state === 'string' ? body.state : '';
    const pending = this.pendingStates.get(state);
    // Nur das Gerät, das die Anmeldung gestartet hat, darf sie abschließen.
    if (!pending || pending.recordId !== id) return { ok: false, error: 'invalid_state' };
    this.pendingStates.delete(state);
    const r = await this.finishAuthorization(pending, typeof body.code === 'string' ? body.code : null, typeof body.error === 'string' ? body.error : null);
    return { ok: r.ok, state: r.rec?.state, error: r.ok ? undefined : (r.message ?? undefined) };
  }

  private async callback(url: URL, res: ServerResponse): Promise<void> {
    const state = url.searchParams.get('state') ?? '';
    const pending = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    const r = await this.finishAuthorization(pending, url.searchParams.get('code'), url.searchParams.get('error'));
    page(res, r.httpStatus, r.title, r.message);
  }

  private async finishAuthorization(
    pending: PendingLogin | undefined,
    code: string | null,
    error: string | null
  ): Promise<{ ok: boolean; httpStatus: number; title: string; message: string; rec?: AuthRecord }> {
    const expired = { ok: false, httpStatus: 400, title: 'Anmeldung abgelaufen', message: 'Bitte starte die Verbindung in LIKED erneut.' };
    if (!pending || pending.expiresAt < this.now()) return expired;
    const rec = this.store.get(pending.recordId);
    if (!rec) return expired;
    if (error || !code) {
      rec.state = rec.tokens ? rec.state : 'error';
      rec.error = error === 'access_denied' ? 'Zugriff wurde auf TikTok abgelehnt.' : 'TikTok hat die Anmeldung abgebrochen.';
      this.store.upsert(rec);
      return { ok: false, httpStatus: 400, title: 'Nicht verbunden', message: rec.error, rec };
    }
    try {
      const tokens = await this.client.exchangeCode(code, this.now(), {
        redirectUri: pending.redirectUri,
        codeVerifier: pending.codeVerifier ?? undefined
      });
      rec.tokens = tokens;
      rec.error = null;
      try {
        const info = await this.client.userInfo(tokens.accessToken);
        rec.displayName = info.displayName || null;
      } catch {
        rec.displayName = null;
      }
      const hasPortability = tokens.scope.some((s) => s.startsWith('portability.'));
      rec.state = hasPortability ? 'connected' : 'unsupported';
      if (!hasPortability) rec.error = 'Die Berechtigung für Aktivitätsdaten (Likes) wurde nicht erteilt.';
      this.store.upsert(rec);
      this.opts.log.info('tiktok_connected', { status: rec.state });
      return { ok: true, httpStatus: 200, title: 'Verbunden', message: 'Dein TikTok-Account ist verbunden. Du kannst dieses Fenster schließen und zu LIKED zurückkehren.', rec };
    } catch (err) {
      const code = err instanceof TikTokApiError ? err.code : 'unknown';
      rec.state = 'error';
      rec.error = `Die Anmeldung konnte nicht abgeschlossen werden (TikTok: ${code.slice(0, 60)}).`;
      this.store.upsert(rec);
      this.opts.log.warn('tiktok_exchange_failed', { code });
      return { ok: false, httpStatus: 502, title: 'Nicht verbunden', message: rec.error, rec };
    }
  }

  status(id: string) {
    const rec = this.store.get(id);
    if (!rec) return { configured: true, state: 'none' as const };
    rec.lastSeenAt = this.now();
    return {
      configured: true,
      state: rec.state,
      account: rec.displayName !== null || rec.tokens ? { displayName: rec.displayName ?? 'TikTok-Account' } : null,
      error: rec.error,
      sync: {
        stage: rec.sync.stage,
        startedAt: rec.sync.startedAt,
        nextCheckAt: rec.sync.nextCheckAt,
        completedAt: rec.sync.completedAt
      },
      likesAvailable: rec.likes ? rec.likes.length : null
    };
  }

  private async withToken<T>(rec: AuthRecord, fn: (accessToken: string) => Promise<T>): Promise<T> {
    if (!rec.tokens) throw new TikTokApiError('access_token_invalid', 401, 'Nicht verbunden');
    if (rec.tokens.expiresAt - 60_000 < this.now()) {
      rec.tokens = await this.client.refresh(rec.tokens.refreshToken, this.now());
      this.store.upsert(rec);
    }
    return fn(rec.tokens.accessToken);
  }

  private applyError(rec: AuthRecord, err: unknown): void {
    if (err instanceof TikTokApiError) {
      if (err.needsReauth) {
        rec.state = 'expired';
        rec.error = 'Die TikTok-Verbindung ist abgelaufen. Bitte erneut anmelden.';
      } else if (err.scopeMissing) {
        rec.state = 'unsupported';
        rec.error = 'Die App hat keine freigegebene Berechtigung für Aktivitätsdaten.';
      } else if (err.unsupported) {
        rec.state = 'unsupported';
        rec.error = 'Dieser Account oder diese Region wird von der Datenübertragung nicht unterstützt.';
      } else {
        rec.state = 'error';
        rec.error = err.retryable ? 'TikTok ist gerade nicht erreichbar.' : 'TikTok hat die Anfrage abgelehnt.';
      }
      this.opts.log.warn('tiktok_api_error', { code: err.code, status: err.httpStatus });
    } else {
      rec.state = 'error';
      rec.error = 'Unerwarteter Fehler bei der Synchronisierung.';
    }
    rec.sync.stage = null;
    rec.sync.nextCheckAt = null;
  }

  async startSync(id: string) {
    const rec = this.store.get(id);
    if (!rec?.tokens) return { error: 'not_connected' };
    if (rec.state === 'syncing') return this.status(id);
    try {
      const requestId = await this.withToken(rec, (t) => this.client.addDataRequest(t));
      rec.state = 'syncing';
      rec.error = null;
      rec.sync = {
        requestId,
        stage: 'preparing',
        startedAt: this.now(),
        nextCheckAt: this.now() + (this.opts.pollInitialMs ?? 60_000),
        attempt: 0,
        completedAt: rec.sync.completedAt
      };
      this.store.upsert(rec);
      this.scheduleCheck(id, this.opts.pollInitialMs ?? 60_000);
    } catch (err) {
      this.applyError(rec, err);
      this.store.upsert(rec);
    }
    return this.status(id);
  }

  private scheduleCheck(id: string, delay: number): void {
    const old = this.jobs.get(id);
    if (old) clearTimeout(old);
    const t = setTimeout(() => {
      this.jobs.delete(id);
      void this.checkSync(id);
    }, delay);
    t.unref();
    this.jobs.set(id, t);
  }

  async checkSync(id: string): Promise<void> {
    const rec = this.store.get(id);
    if (!rec || rec.state !== 'syncing' || !rec.sync.requestId) return;
    const maxDur = this.opts.maxSyncDurationMs ?? 7 * 24 * 3_600_000;
    if (rec.sync.startedAt && this.now() - rec.sync.startedAt > maxDur) {
      rec.state = 'error';
      rec.error = 'TikTok hat die Daten nicht rechtzeitig bereitgestellt. Bitte erneut synchronisieren.';
      this.store.upsert(rec);
      return;
    }
    try {
      const { status } = await this.withToken(rec, (t) => this.client.checkDataRequest(t, rec.sync.requestId!));
      if (status === 'preparing') {
        rec.sync.attempt++;
        const delay = Math.min(
          (this.opts.pollInitialMs ?? 60_000) * 1.5 ** rec.sync.attempt,
          this.opts.pollMaxMs ?? 15 * 60_000
        );
        rec.sync.nextCheckAt = this.now() + delay;
        this.store.upsert(rec);
        this.scheduleCheck(id, delay);
        return;
      }
      if (status === 'expired' || status === 'cancelled') {
        rec.state = 'error';
        rec.error = status === 'expired' ? 'Die Datenanfrage ist abgelaufen.' : 'Die Datenanfrage wurde abgebrochen.';
        rec.sync.stage = null;
        this.store.upsert(rec);
        return;
      }
      await this.downloadAndExtract(rec);
    } catch (err) {
      if (err instanceof TikTokApiError && err.retryable && rec.sync.attempt < 50) {
        rec.sync.attempt++;
        this.store.upsert(rec);
        this.scheduleCheck(id, Math.min(60_000 * 2 ** Math.min(rec.sync.attempt, 4), 15 * 60_000));
        return;
      }
      this.applyError(rec, err);
      this.store.upsert(rec);
    }
  }

  private async downloadAndExtract(rec: AuthRecord): Promise<void> {
    const tmp = join(tmpdir(), `liked-${randomBytes(12).toString('hex')}.bin`);
    try {
      rec.sync.stage = 'downloading';
      this.store.upsert(rec);
      await this.withToken(rec, (t) =>
        this.client.downloadDataRequest(t, rec.sync.requestId!, tmp, this.opts.maxArchiveBytes ?? 4 * 1024 ** 3)
      );
      rec.sync.stage = 'extracting';
      this.store.upsert(rec);
      const likes = await extractLikesFromArchiveFile(tmp, { maxLikes: 20_000 });
      rec.likes = likes.map((l) => (l.likedAt !== undefined ? { id: l.videoId, t: l.likedAt } : { id: l.videoId }));
      rec.likesExpireAt = this.now() + LIKES_TTL_MS;
      rec.state = 'ready';
      rec.sync.stage = null;
      rec.sync.nextCheckAt = null;
      rec.sync.completedAt = this.now();
      rec.sync.requestId = null;
      this.store.upsert(rec);
      this.opts.log.info('tiktok_sync_ready', { count: likes.length });
    } finally {
      await rm(tmp, { force: true });
    }
  }

  async cancelSync(id: string) {
    const rec = this.store.get(id);
    if (!rec) return { ok: true };
    const t = this.jobs.get(id);
    if (t) clearTimeout(t);
    this.jobs.delete(id);
    if (rec.sync.requestId && rec.tokens) {
      await this.withToken(rec, (tok) => this.client.cancelDataRequest(tok, rec.sync.requestId!)).catch(() => undefined);
    }
    rec.sync.requestId = null;
    rec.sync.stage = null;
    rec.sync.nextCheckAt = null;
    rec.state = rec.tokens ? 'connected' : 'authorizing';
    this.store.upsert(rec);
    return this.status(id);
  }

  /** Einmalige Übergabe der Like-IDs an das Gerät; danach auf dem Server gelöscht. */
  takeLikes(id: string) {
    const rec = this.store.get(id);
    if (!rec?.likes) return { likes: null };
    const likes = rec.likes;
    const syncedAt = rec.sync.completedAt;
    rec.likes = null;
    rec.likesExpireAt = null;
    this.store.upsert(rec);
    return { likes, syncedAt, displayName: rec.displayName };
  }

  /** Verbindung trennen: Token bei TikTok widerrufen und alles zu diesem Gerät löschen. */
  async disconnect(id: string) {
    const rec = this.store.get(id);
    const t = this.jobs.get(id);
    if (t) clearTimeout(t);
    this.jobs.delete(id);
    if (rec?.tokens) await this.client.revoke(rec.tokens.accessToken).catch(() => undefined);
    this.store.delete(id);
    return { ok: true };
  }
}

function bearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization ?? '';
  const m = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(h);
  return m?.[1] ?? null;
}

/** Kleiner JSON-Body (max. 4 KB); bei Fehlern ein leeres Objekt. */
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  try {
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > 4096) return {};
      chunks.push(c as Buffer);
    }
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function page(res: ServerResponse, status: number, title: string, text: string): void {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'"
  });
  res.end(`<!doctype html><html lang="de"><meta charset="utf-8"><title>LIKED – ${esc(title)}</title>
<body style="background:#0c0c10;color:#eee;font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:420px;text-align:center"><h1 style="color:#a855f7;letter-spacing:.08em">LIKED</h1><h2>${esc(title)}</h2><p style="color:#bbb">${esc(text)}</p></div></body></html>`);
}

/** Redirect-URL mit oder ohne abschließenden Schrägstrich (je nach Eintrag in der TikTok-App). */
export function isCallbackPath(pathname: string): boolean {
  return pathname === '/auth/tiktok/callback' || pathname === '/auth/tiktok/callback/';
}
