import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Serverseitiger Client für TikTok Login Kit (OAuth v2) und die Data Portability API.
 *
 * Quellen (Recherche 26.09.2026, developers.tiktok.com – aus der Build-Umgebung nicht
 * direkt abrufbar, daher vor Produktivbetrieb erneut prüfen):
 *  - Login Kit Web: /v2/auth/authorize/, /v2/oauth/token/, /v2/oauth/revoke/
 *  - Data Portability: /v2/user/data/add/, /v2/user/data/check/, /v2/user/data/download/,
 *    /v2/user/data/cancel/; Scopes portability.<type>.single|ongoing, type ∈ all, activity,
 *    directmessages, postsandprofile. Regionen laut Produktseite: EWR + UK.
 * Das Client-Secret wird ausschließlich hier (Backend) verwendet.
 */
export interface TikTokAppConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authBase?: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  openId: string;
  scope: string[];
  expiresAt: number;
  refreshExpiresAt: number;
}

export type DataRequestStatus = 'preparing' | 'ready' | 'expired' | 'cancelled';

export class TikTokApiError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string,
    readonly logId?: string
  ) {
    super(message);
  }
  /** Zugangsdaten ungültig oder abgelaufen → erneute Anmeldung nötig. */
  get needsReauth(): boolean {
    return /access_token_invalid|invalid_grant|token.*expired|refresh_token/i.test(this.code) || this.httpStatus === 401;
  }
  get scopeMissing(): boolean {
    return /scope_not_authorized|scope_permission_missed|insufficient_scope/i.test(this.code);
  }
  get unsupported(): boolean {
    return /region|not_supported|unsupported|not_eligible/i.test(this.code);
  }
  get retryable(): boolean {
    return this.httpStatus === 429 || this.httpStatus >= 500 || /rate_limit|internal_error|timeout/i.test(this.code);
  }
}

export function mapDataRequestStatus(raw: string): DataRequestStatus {
  const s = raw.toLowerCase();
  if (/expire/.test(s)) return 'expired';
  if (/cancel/.test(s)) return 'cancelled';
  if (/ready|download|complete|success|finish/.test(s)) return 'ready';
  return 'preparing';
}

export class TikTokPortabilityClient {
  private readonly authBase: string;
  private readonly apiBase: string;
  private readonly f: typeof fetch;

  constructor(private readonly cfg: TikTokAppConfig) {
    this.authBase = cfg.authBase ?? 'https://www.tiktok.com';
    this.apiBase = cfg.apiBase ?? 'https://open.tiktokapis.com';
    this.f = cfg.fetchImpl ?? fetch;
  }

  authorizeUrl(state: string): string {
    const q = new URLSearchParams({
      client_key: this.cfg.clientKey,
      scope: this.cfg.scopes.join(','),
      response_type: 'code',
      redirect_uri: this.cfg.redirectUri,
      state
    });
    return `${this.authBase}/v2/auth/authorize/?${q.toString()}`;
  }

  private async form(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await this.f(`${this.apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(20_000)
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof json.error === 'string') {
      throw new TikTokApiError(
        String(json.error ?? `http_${res.status}`),
        res.status,
        String(json.error_description ?? 'OAuth-Fehler'),
        typeof json.log_id === 'string' ? json.log_id : undefined
      );
    }
    return json;
  }

  private toTokenSet(json: Record<string, unknown>, now: number): TokenSet {
    return {
      accessToken: String(json.access_token),
      refreshToken: String(json.refresh_token),
      openId: String(json.open_id),
      scope: String(json.scope ?? '').split(',').filter(Boolean),
      expiresAt: now + Number(json.expires_in ?? 0) * 1000,
      refreshExpiresAt: now + Number(json.refresh_expires_in ?? 0) * 1000
    };
  }

  async exchangeCode(code: string, now = Date.now()): Promise<TokenSet> {
    const json = await this.form('/v2/oauth/token/', {
      client_key: this.cfg.clientKey,
      client_secret: this.cfg.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.cfg.redirectUri
    });
    return this.toTokenSet(json, now);
  }

  async refresh(refreshToken: string, now = Date.now()): Promise<TokenSet> {
    const json = await this.form('/v2/oauth/token/', {
      client_key: this.cfg.clientKey,
      client_secret: this.cfg.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });
    return this.toTokenSet(json, now);
  }

  async revoke(accessToken: string): Promise<void> {
    await this.form('/v2/oauth/revoke/', {
      client_key: this.cfg.clientKey,
      client_secret: this.cfg.clientSecret,
      token: accessToken
    });
  }

  private async api(path: string, accessToken: string, init: { method: 'GET' | 'POST'; body?: unknown }) {
    const res = await this.f(`${this.apiBase}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {})
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(30_000)
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: Record<string, unknown>;
      error?: { code?: string; message?: string; log_id?: string };
    };
    const code = json.error?.code ?? (res.ok ? 'ok' : `http_${res.status}`);
    if (!res.ok || code !== 'ok') {
      throw new TikTokApiError(code, res.status, json.error?.message ?? 'API-Fehler', json.error?.log_id);
    }
    return json.data ?? {};
  }

  /** Anzeigename zur eindeutigen Erkennung des verbundenen Accounts (Scope user.info.basic). */
  async userInfo(accessToken: string): Promise<{ openId: string; displayName: string; avatarUrl?: string }> {
    const data = await this.api('/v2/user/info/?fields=open_id,display_name,avatar_url', accessToken, { method: 'GET' });
    const user = (data.user ?? {}) as Record<string, unknown>;
    return {
      openId: String(user.open_id ?? ''),
      displayName: String(user.display_name ?? ''),
      avatarUrl: typeof user.avatar_url === 'string' ? user.avatar_url : undefined
    };
  }

  async addDataRequest(accessToken: string): Promise<string> {
    const data = await this.api('/v2/user/data/add/?fields=request_id', accessToken, {
      method: 'POST',
      body: { data_format: 'json', category_selection_list: ['activity'] }
    });
    const id = data.request_id;
    if (typeof id !== 'string' && typeof id !== 'number') throw new TikTokApiError('missing_request_id', 200, 'Keine request_id');
    return String(id);
  }

  async checkDataRequest(accessToken: string, requestId: string): Promise<{ status: DataRequestStatus; raw: string }> {
    const data = await this.api('/v2/user/data/check/?fields=status', accessToken, {
      method: 'POST',
      body: { request_id: requestId }
    });
    const raw = String(data.status ?? '');
    return { status: mapDataRequestStatus(raw), raw };
  }

  async cancelDataRequest(accessToken: string, requestId: string): Promise<void> {
    await this.api('/v2/user/data/cancel/', accessToken, { method: 'POST', body: { request_id: requestId } });
  }

  /** Lädt das Archiv als Datenstrom in eine (kurzlebige) Datei. */
  async downloadDataRequest(accessToken: string, requestId: string, targetPath: string, maxBytes: number): Promise<number> {
    const res = await this.f(`${this.apiBase}/v2/user/data/download/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId }),
      signal: AbortSignal.timeout(30 * 60_000)
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !res.body || /json/.test(type)) {
      const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      throw new TikTokApiError(json.error?.code ?? `http_${res.status}`, res.status, json.error?.message ?? 'Download fehlgeschlagen');
    }
    let bytes = 0;
    const src = Readable.fromWeb(res.body as never);
    src.on('data', (c: Buffer) => {
      bytes += c.length;
      if (bytes > maxBytes) src.destroy(new Error('Archiv überschreitet die Größenbegrenzung'));
    });
    await pipeline(src, createWriteStream(targetPath, { mode: 0o600 }));
    return bytes;
  }
}
