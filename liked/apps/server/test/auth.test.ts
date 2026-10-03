import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import yazl from 'yazl';
import { startServer, type Srv } from './helpers.js';

/**
 * Nachgebaute TikTok-API (nur für Tests). Echte TikTok-Endpunkte werden hier
 * NICHT kontaktiert – siehe docs/INTEGRATION_REPORT.md für den Stand des Realtests.
 */
function mockTikTok() {
  const state = {
    checks: 0,
    revoked: [] as string[],
    readyAfter: 2,
    archive: Buffer.alloc(0) as Buffer,
    scope: 'user.info.basic,portability.activity.single',
    lastToken: null as Record<string, string> | null
  };
  const srv: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      const url = new URL(req.url!, 'http://x');
      const j = (o: unknown, s = 200) => {
        res.writeHead(s, { 'content-type': 'application/json' });
        res.end(JSON.stringify(o));
      };
      if (url.pathname === '/v2/oauth/token/') {
        const p = new URLSearchParams(body);
        state.lastToken = Object.fromEntries(p);
        if (p.get('client_secret') !== 'test-secret') return j({ error: 'invalid_client' }, 401);
        if (p.get('code') === 'bad') return j({ error: 'invalid_grant', error_description: 'x' }, 400);
        return j({ access_token: 'act.SECRET-ACCESS', refresh_token: 'rft.SECRET-REFRESH', open_id: 'open-1', scope: state.scope, expires_in: 86400, refresh_expires_in: 999999 });
      }
      if (url.pathname === '/v2/oauth/revoke/') {
        state.revoked.push(new URLSearchParams(body).get('token')!);
        return j({});
      }
      if (url.pathname === '/v2/user/info/') return j({ data: { user: { open_id: 'open-1', display_name: 'Testkonto' } }, error: { code: 'ok' } });
      if (url.pathname === '/v2/user/data/add/') return j({ data: { request_id: 'req-77' }, error: { code: 'ok' } });
      if (url.pathname === '/v2/user/data/check/') {
        state.checks++;
        return j({ data: { status: state.checks >= state.readyAfter ? 'downloading' : 'pending' }, error: { code: 'ok' } });
      }
      if (url.pathname === '/v2/user/data/download/') {
        res.writeHead(200, { 'content-type': 'application/zip' });
        return res.end(state.archive);
      }
      if (url.pathname === '/v2/user/data/cancel/') return j({ data: {}, error: { code: 'ok' } });
      j({ error: { code: 'not_found' } }, 404);
    });
  });
  return { srv, state };
}

async function zipOf(obj: unknown): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(obj)), 'user_data.json');
  zip.end();
  const parts: Buffer[] = [];
  for await (const c of zip.outputStream) parts.push(c as Buffer);
  return Buffer.concat(parts);
}

let server: Srv | null = null;
let mock: Server | null = null;
let dataDir = '';
afterEach(async () => {
  await server?.close();
  server = null;
  mock?.close();
  mock = null;
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

async function setup(scope?: string, redirectUri = 'http://127.0.0.1/auth/tiktok/callback') {
  const m = mockTikTok();
  if (scope) m.state.scope = scope;
  m.state.archive = await zipOf({
    'Your Activity': {
      'Like List': { ItemFavoriteList: Array.from({ length: 12 }, (_, i) => ({ Date: `2024-05-${String(i + 1).padStart(2, '0')} 10:00:00`, Link: `https://www.tiktokv.com/share/video/74000000000000000${String(i).padStart(2, '0')}/` })) },
      'Favorite Videos': { FavoriteVideoList: [{ Date: '2024-01-01 00:00:00', Link: 'https://www.tiktokv.com/share/video/1234567/' }] }
    },
    Video: { Videos: { VideoList: [{ Date: '2024-01-01 00:00:00', Link: 'https://www.tiktokv.com/share/video/7654321/' }] } }
  });
  await new Promise<void>((r) => m.srv.listen(0, '127.0.0.1', () => r()));
  mock = m.srv;
  const addr = m.srv.address() as { port: number };
  const base = `http://127.0.0.1:${addr.port}`;
  dataDir = mkdtempSync(join(tmpdir(), 'liked-auth-'));
  const s = await startServer({
    dataDir,
    tokenEncryptionKey: randomBytes(32),
    tiktok: { clientKey: 'ck', clientSecret: 'test-secret', redirectUri, scopes: ['user.info.basic', 'portability.activity.single'] }
  });
  server = s.server;
  // Mock-Basis-URLs einsetzen (nur Test).
  const client = s.server.auth!.client as unknown as { authBase: string; apiBase: string };
  client.apiBase = base;
  client.authBase = base;
  (s.server.auth as unknown as { opts: { pollInitialMs: number } }).opts.pollInitialMs = 30;
  return { ...s, mockState: m.state };
}

const secret = () => randomBytes(32).toString('base64url');
const call = (url: string, path: string, sec: string, method = 'GET') =>
  fetch(`${url}${path}`, { method, headers: { Authorization: `Bearer ${sec}` } }).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, any> }));

describe('Offizieller Adapter (gegen Mock-API, Abnahme 2, 3, 13)', () => {
  it('Login allein setzt nicht auf bereit; erst ein erfolgreicher Import', async () => {
    const { url, mockState } = await setup();
    const sec = secret();
    const login = await call(url, '/api/tiktok/login', sec, 'POST');
    const authUrl = new URL(login.body.authorizeUrl);
    expect(authUrl.searchParams.get('client_key')).toBe('ck');
    expect(login.body.authorizeUrl).not.toContain('test-secret');

    // Simulierter Redirect von TikTok
    const cb = await fetch(`${url}/auth/tiktok/callback?code=abc&state=${authUrl.searchParams.get('state')}`);
    expect(cb.status).toBe(200);
    let st = await call(url, '/api/tiktok/status', sec);
    expect(st.body.state).toBe('connected');
    expect(st.body.account.displayName).toBe('Testkonto');
    expect(st.body.likesAvailable).toBeNull();

    // Callback-State ist einmalig
    const replay = await fetch(`${url}/auth/tiktok/callback?code=abc&state=${authUrl.searchParams.get('state')}`);
    expect(replay.status).toBe(400);

    const sync = await call(url, '/api/tiktok/sync', sec, 'POST');
    expect(sync.body.state).toBe('syncing');
    for (let i = 0; i < 200; i++) {
      st = await call(url, '/api/tiktok/status', sec);
      if (st.body.state === 'ready') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(st.body.state).toBe('ready');
    expect(st.body.likesAvailable).toBe(12);
    expect(mockState.checks).toBeGreaterThanOrEqual(2);

    const likes = await call(url, '/api/tiktok/likes', sec);
    expect(likes.body.likes).toHaveLength(12);
    const ids = likes.body.likes.map((l: { id: string }) => l.id);
    expect(ids).not.toContain('1234567'); // Lesezeichen
    expect(ids).not.toContain('7654321'); // eigene Uploads
    // Einmalige Übergabe
    expect((await call(url, '/api/tiktok/likes', sec)).body.likes).toBeNull();

    // Tokens stehen weder im Status, noch in Logs, noch unverschlüsselt auf der Platte
    expect(JSON.stringify(st.body)).not.toContain('SECRET');
    expect(server!.log.lines!.join('\n')).not.toContain('SECRET');
    const disk = readFileSync(join(dataDir, 'auth-store.bin'));
    expect(disk.toString('latin1')).not.toContain('SECRET');

    // Trennen widerruft das Token und löscht den Datensatz
    const dis = await call(url, '/api/tiktok/connection', sec, 'DELETE');
    expect(dis.body.ok).toBe(true);
    expect(mockState.revoked).toContain('act.SECRET-ACCESS');
    expect((await call(url, '/api/tiktok/status', sec)).body.state).toBe('none');
  }, 20000);

  it('ohne freigegebenen Portability-Scope ist der Status „nicht unterstützt“ statt „bereit“', async () => {
    const { url } = await setup('user.info.basic');
    const sec = secret();
    const login = await call(url, '/api/tiktok/login', sec, 'POST');
    const state = new URL(login.body.authorizeUrl).searchParams.get('state');
    await fetch(`${url}/auth/tiktok/callback?code=abc&state=${state}`);
    const st = await call(url, '/api/tiktok/status', sec);
    expect(st.body.state).toBe('unsupported');
  });

  it('abgelehnte Anmeldung führt zu Fehler, nicht zu bereit', async () => {
    const { url } = await setup();
    const sec = secret();
    const login = await call(url, '/api/tiktok/login', sec, 'POST');
    const state = new URL(login.body.authorizeUrl).searchParams.get('state');
    const cb = await fetch(`${url}/auth/tiktok/callback?error=access_denied&state=${state}`);
    expect(cb.status).toBe(400);
    expect((await call(url, '/api/tiktok/status', sec)).body.state).toBe('error');
  });

  it('akzeptiert die Redirect-URL auch mit abschließendem Schrägstrich', async () => {
    const { url } = await setup();
    const h = await fetch(`${url}/healthz`).then((r) => r.json());
    expect(h.tiktokRedirectUri).toBe('http://127.0.0.1/auth/tiktok/callback');
    expect(JSON.stringify(h)).not.toContain('test-secret');
    const sec = secret();
    const login = await call(url, '/api/tiktok/login', sec, 'POST');
    const state = new URL(login.body.authorizeUrl).searchParams.get('state');
    const cb = await fetch(`${url}/auth/tiktok/callback/?code=abc&state=${state}`);
    expect(cb.status).toBe(200);
    expect((await call(url, '/api/tiktok/status', sec)).body.state).not.toBe('error');
  });

  it('ohne Gerätegeheimnis kein Zugriff', async () => {
    const { url } = await setup();
    const r = await fetch(`${url}/api/tiktok/status`);
    expect(r.status).toBe(401);
  });
});

describe('Server ohne TikTok-Konfiguration', () => {
  it('meldet den offiziellen Adapter ehrlich als nicht konfiguriert', async () => {
    const s = await startServer();
    server = s.server;
    const h = await fetch(`${s.url}/healthz`).then((r) => r.json());
    expect(h).toMatchObject({ ok: true, tiktokOfficialAdapter: 'not_configured' });
    expect((await fetch(`${s.url}/healthz`)).headers.get('access-control-allow-origin')).toBe('*');
    const r = await fetch(`${s.url}/api/tiktok/login`, { method: 'POST' });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'not_configured', configured: false });
  });
});

describe('TikTok-URL-Verifizierung', () => {
  it('liest Dateinamen tolerant ein und meldet fehlende Werte', async () => {
    const { parseTikTokVerification } = await import('../src/config.js');
    expect(parseTikTokVerification({ TIKTOK_VERIFY_FILE: ' "https://x.onrender.com/auth/tiktok/callback/tiktokAbC123.txt" ', TIKTOK_VERIFY_CONTENT: 'sig=1\n' } as never))
      .toEqual({ tiktokVerification: { file: 'tiktokAbC123.txt', content: 'sig=1' }, tiktokVerificationStatus: 'ok' });
    expect(parseTikTokVerification({ TIKTOK_VERIFY_FILE: 'tiktokAbC123.txt' } as never).tiktokVerificationStatus).toBe('missing_content');
    expect(parseTikTokVerification({ TIKTOK_VERIFY_CONTENT: 'x' } as never).tiktokVerificationStatus).toBe('missing_file');
    expect(parseTikTokVerification({} as never).tiktokVerificationStatus).toBe('not_set');
    expect(parseTikTokVerification({ TIKTOK_VERIFY_FILE_2: 'tiktokTerms1234.txt', TIKTOK_VERIFY_CONTENT_2: 'sig=2' } as never, '_2').tiktokVerification)
      .toEqual({ file: 'tiktokTerms1234.txt', content: 'sig=2' });
    expect(parseTikTokVerification({ TIKTOK_VERIFY_FILE: 'bad name.txt', TIKTOK_VERIFY_CONTENT: 'x' } as never).tiktokVerificationStatus).toBe('invalid_file');
  });

  it('liefert die Verifizierungsdatei unter dem Callback-Präfix und im Root aus', async () => {
    const s = await startServer({
      tiktokVerification: { file: 'tiktokAbCdEf123456.txt', content: 'tiktok-developers-site-verification=XYZ' },
      tiktokVerificationExtra: [{ file: 'tiktokTerms1234.txt', content: 'sig=terms', status: 'ok' }]
    });
    expect(await fetch(`${s.url}/terms/tiktokTerms1234.txt`).then((r) => r.text())).toBe('sig=terms');
    server = s.server;
    for (const path of ['/auth/tiktok/callback/tiktokAbCdEf123456.txt', '/tiktokAbCdEf123456.txt']) {
      const r = await fetch(`${s.url}${path}`);
      expect(r.status).toBe(200);
      expect(await r.text()).toBe('tiktok-developers-site-verification=XYZ');
    }
    expect((await fetch(`${s.url}/auth/tiktok/callback/andere.txt`)).status).toBe(404);
    expect((await fetch(`${s.url}/auth/tiktok/callback/tiktokAbCdEf123456.txt`, { method: 'HEAD' })).status).toBe(200);
    expect((await fetch(`${s.url}/healthz`).then((r) => r.json())).tiktokVerifyFile).toBe('tiktokAbCdEf123456.txt');
  });
});

describe('Login Kit for Desktop (Loopback-Redirect)', () => {
  const post = (url: string, path: string, sec: string, body: unknown) =>
    fetch(`${url}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${sec}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(
      async (r) => ({ status: r.status, body: (await r.json()) as Record<string, any> })
    );

  it('nutzt den Port des Geräts, PKCE und schließt die Anmeldung über /complete ab', async () => {
    const { url, mockState } = await setup(undefined, 'http://localhost:*/callback/');
    expect((await fetch(`${url}/healthz`).then((r) => r.json())).tiktokLoginMode).toBe('desktop');
    const sec = secret();
    expect((await post(url, '/api/tiktok/login', sec, {})).status).toBe(400);
    const login = await post(url, '/api/tiktok/login', sec, { loopbackPort: 51234 });
    expect(login.status).toBe(200);
    expect(login.body.redirectUri).toBe('http://localhost:51234/callback/');
    const au = new URL(login.body.authorizeUrl);
    expect(au.searchParams.get('redirect_uri')).toBe('http://localhost:51234/callback/');
    expect(au.searchParams.get('code_challenge_method')).toBe('S256');
    expect(au.searchParams.get('code_challenge')).toMatch(/^[0-9a-f]{64}$/);
    const state = au.searchParams.get('state')!;

    // Ein fremdes Gerät kann den State nicht verwenden
    expect((await post(url, '/api/tiktok/complete', secret(), { state, code: 'abc' })).body).toMatchObject({ ok: false, error: 'invalid_state' });

    const done = await post(url, '/api/tiktok/complete', sec, { state, code: 'abc' });
    expect(done.body).toMatchObject({ ok: true, state: 'connected' });
    // Austausch mit derselben Redirect-URL und einem Verifier, dessen SHA-256 (hex) die Challenge ist
    expect(mockState.lastToken!.redirect_uri).toBe('http://localhost:51234/callback/');
    const { createHash } = await import('node:crypto');
    expect(createHash('sha256').update(mockState.lastToken!.code_verifier!).digest('hex')).toBe(au.searchParams.get('code_challenge'));
    expect((await call(url, '/api/tiktok/status', sec)).body.state).toBe('connected');
    // Einmalig
    expect((await post(url, '/api/tiktok/complete', sec, { state, code: 'abc' })).body.ok).toBe(false);
  });

  it('meldet eine Ablehnung im Browser als Fehler', async () => {
    const { url } = await setup(undefined, 'http://localhost:*/callback/');
    const sec = secret();
    const login = await post(url, '/api/tiktok/login', sec, { loopbackPort: 40000 });
    const state = new URL(login.body.authorizeUrl).searchParams.get('state');
    const r = await post(url, '/api/tiktok/complete', sec, { state, error: 'access_denied' });
    expect(r.body.ok).toBe(false);
    expect((await call(url, '/api/tiktok/status', sec)).body.state).toBe('error');
  });

  it('erkennt Loopback-Adressen und setzt Ports ein', async () => {
    const { isLoopbackRedirect, loopbackRedirectFor } = await import('../src/auth/tiktok-auth-service.js');
    expect(isLoopbackRedirect('http://localhost:*/callback/')).toBe(true);
    expect(isLoopbackRedirect('https://127.0.0.1:3455/callback/')).toBe(true);
    expect(isLoopbackRedirect('https://liked-partyspiel.onrender.com/auth/tiktok/callback')).toBe(false);
    expect(loopbackRedirectFor('http://localhost:*/callback/', 80)).toBeNull();
    expect(loopbackRedirectFor('https://127.0.0.1:3455/callback/', undefined)).toBe('https://127.0.0.1:3455/callback/');
  });
});

describe('TikTok-Konfiguration aus dem Dashboard', () => {
  it('bereinigt Leerzeichen und Anführungszeichen und nutzt sonst die Standard-Redirect-URL', async () => {
    const { loadConfig } = await import('../src/config.js');
    const key = randomBytes(32).toString('base64');
    const base = { TIKTOK_CLIENT_KEY: ' ck ', TIKTOK_CLIENT_SECRET: '"cs"', TOKEN_ENCRYPTION_KEY: key, RENDER_EXTERNAL_URL: 'https://x.onrender.com' };
    const a = loadConfig({ ...base, TIKTOK_REDIRECT_URI: ' "https://x.onrender.com/auth/tiktok/callback/" ', TIKTOK_SCOPES: 'user.info.basic, portability.activity.single,' } as never);
    expect(a.tiktok).toMatchObject({ clientKey: 'ck', clientSecret: 'cs', redirectUri: 'https://x.onrender.com/auth/tiktok/callback/', scopes: ['user.info.basic', 'portability.activity.single'] });
    const b = loadConfig(base as never);
    expect(b.tiktok!.redirectUri).toBe('https://x.onrender.com/auth/tiktok/callback');
  });
});

describe('Rechtstexte', () => {
  it('liefert Datenschutzerklärung und Nutzungsbedingungen mit Betreiberangaben aus', async () => {
    const s = await startServer({ operator: { name: 'Max <Muster>', contact: 'max@example.org' } });
    server = s.server;
    const privacy = await fetch(`${s.url}/privacy`).then((r) => r.text());
    expect(privacy).toContain('Datenschutzerklärung');
    expect(privacy).toContain('Privacy Policy');
    expect(privacy).toContain('Max &#60;Muster&#62;');
    const home = await fetch(`${s.url}/`).then((r) => r.text());
    expect(home).toContain('Aus wessen Likes stammt dieser Clip?');
    expect(home).toContain('/privacy');
    const terms = await fetch(`${s.url}/terms`);
    expect(terms.status).toBe(200);
    expect((await fetch(`${s.url}/terms/`)).status).toBe(200);
    expect((await fetch(`${s.url}/privacy/`)).status).toBe(200);
    expect(await terms.text()).toContain('Terms of Service');
  });
});
