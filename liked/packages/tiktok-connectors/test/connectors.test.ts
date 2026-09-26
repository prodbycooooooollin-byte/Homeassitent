import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, createWriteStream, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yazl from 'yazl';
import {
  extractLikesFromArchiveFile,
  LikeListCollector,
  mapDataRequestStatus,
  TikTokApiError,
  TikTokPortabilityClient
} from '../src/node.js';
import { buildIndex, hashVideoId, likesFromVisibleLinks, selectCandidates, demoLikes, demoClipLook } from '../src/index.js';

/** Synthetisches Archiv in der dokumentierten Struktur – mit Störsektionen. */
const archive = {
  Profile: { 'Profile Information': { ProfileMap: { userName: 'testnutzer' } } },
  'Your Activity': {
    'Favorite Videos': { FavoriteVideoList: [{ Date: '2024-01-01 10:00:00', Link: 'https://www.tiktokv.com/share/video/1111111111/' }] },
    'Video Browsing History': { VideoList: [{ Date: '2024-01-02 10:00:00', Link: 'https://www.tiktokv.com/share/video/2222222222/' }] },
    'Like List': {
      ItemFavoriteList: [
        { Date: '2024-03-05 12:00:00', Link: 'https://www.tiktokv.com/share/video/7300000000000000001/' },
        { date: '2024-02-01 08:30:00', link: 'https://www.tiktok.com/@x/video/7300000000000000002' },
        { Date: '2024-02-01 08:30:00', Link: 'https://www.tiktok.com/@x/video/7300000000000000002' },
        { Date: 'kaputt', Link: 'https://evil.example/video/7300000000000000009' },
        { Date: '2023-12-24 18:00:00', Link: 'https://www.tiktokv.com/share/video/7300000000000000003/' }
      ]
    }
  },
  'Direct Messages': { 'Chat History': { ChatHistory: { 'Chat mit X': [{ Date: '2024-01-01', From: 'x', Content: 'geheim' }] } } },
  Video: { Videos: { VideoList: [{ Date: '2024-01-01 00:00:00', Link: 'https://www.tiktokv.com/share/video/3333333333/' }] } }
};

function tmp() {
  return mkdtempSync(join(tmpdir(), 'liked-test-'));
}

describe('Archivparser (Abnahme 2)', () => {
  it('liest nur die Like List – keine Lesezeichen, Verläufe, Uploads oder Nachrichten', async () => {
    const dir = tmp();
    const file = join(dir, 'user_data.json');
    writeFileSync(file, JSON.stringify(archive));
    const likes = await extractLikesFromArchiveFile(file);
    expect(likes.map((l) => l.videoId)).toEqual(['7300000000000000001', '7300000000000000002', '7300000000000000003']);
    expect(likes[0]!.likedAt).toBe(Date.parse('2024-03-05T12:00:00Z'));
    rmSync(dir, { recursive: true });
  });

  it('liest JSON aus einem ZIP im Datenstrom', async () => {
    const dir = tmp();
    const zipPath = join(dir, 'archive.zip');
    const zip = new yazl.ZipFile();
    zip.addBuffer(Buffer.from('nicht relevant'), 'readme.txt');
    zip.addBuffer(Buffer.from(JSON.stringify(archive)), 'TikTok_Data/user_data.json');
    await new Promise<void>((res) => {
      zip.outputStream.pipe(createWriteStream(zipPath)).on('close', () => res());
      zip.end();
    });
    const likes = await extractLikesFromArchiveFile(zipPath);
    expect(likes).toHaveLength(3);
    rmSync(dir, { recursive: true });
  });

  it('respektiert die Obergrenze', () => {
    const c = new LikeListCollector(2);
    const toks = [
      { name: 'startObject' },
      { name: 'keyValue', value: 'Like List' },
      { name: 'startArray' },
      ...[1, 2, 3].flatMap((i) => [
        { name: 'startObject' },
        { name: 'keyValue', value: 'Link' },
        { name: 'stringValue', value: `https://www.tiktok.com/@a/video/${9000000 + i}` },
        { name: 'endObject' }
      ]),
      { name: 'endArray' },
      { name: 'endObject' }
    ];
    toks.forEach((t) => c.token(t));
    expect(c.result()).toHaveLength(2);
  });
});

describe('Portability-Client gegen Mock-API', () => {
  const calls: { url: string; body?: string; auth?: string }[] = [];
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, body: init?.body as string | undefined, auth: (init?.headers as Record<string, string>)?.Authorization });
    const j = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/v2/oauth/token/'))
      return j({ access_token: 'at', refresh_token: 'rt', open_id: 'oid', scope: 'user.info.basic,portability.activity.single', expires_in: 86400, refresh_expires_in: 31536000 });
    if (url.includes('/v2/user/data/add/')) return j({ data: { request_id: 123456 }, error: { code: 'ok' } });
    if (url.includes('/v2/user/data/check/')) return j({ data: { status: 'pending' }, error: { code: 'ok' } });
    if (url.includes('/v2/user/info/')) return j({ data: {}, error: { code: 'access_token_invalid', message: 'x' } }, 401);
    return j({}, 404);
  };
  const client = new TikTokPortabilityClient({
    clientKey: 'ck',
    clientSecret: 'secret',
    redirectUri: 'https://srv.example/auth/tiktok/callback',
    scopes: ['user.info.basic', 'portability.activity.single'],
    fetchImpl: mockFetch
  });

  it('baut die Autorisierungs-URL ohne Secret', () => {
    const u = new URL(client.authorizeUrl('state123'));
    expect(u.origin + u.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(u.searchParams.get('scope')).toBe('user.info.basic,portability.activity.single');
    expect(u.searchParams.get('state')).toBe('state123');
    expect(u.toString()).not.toContain('secret');
  });

  it('tauscht Code, fordert Aktivitätsdaten an und prüft den Status', async () => {
    const t = await client.exchangeCode('code', 1000);
    expect(t).toMatchObject({ accessToken: 'at', openId: 'oid', expiresAt: 1000 + 86400_000 });
    expect(await client.addDataRequest('at')).toBe('123456');
    const addCall = calls.find((c) => c.url.includes('/data/add/'))!;
    expect(JSON.parse(addCall.body!)).toEqual({ data_format: 'json', category_selection_list: ['activity'] });
    expect(addCall.auth).toBe('Bearer at');
    expect(await client.checkDataRequest('at', '123456')).toEqual({ status: 'preparing', raw: 'pending' });
  });

  it('meldet abgelaufene Tokens als Re-Auth-Fall', async () => {
    const err = await client.userInfo('bad').catch((e) => e);
    expect(err).toBeInstanceOf(TikTokApiError);
    expect(err.needsReauth).toBe(true);
  });

  it('bildet Statuswerte ab', () => {
    expect(mapDataRequestStatus('pending')).toBe('preparing');
    expect(mapDataRequestStatus('downloading')).toBe('ready');
    expect(mapDataRequestStatus('expired')).toBe('expired');
    expect(mapDataRequestStatus('cancelled')).toBe('cancelled');
  });
});

describe('Lokaler Index', () => {
  const likes = Array.from({ length: 100 }, (_, i) => ({ videoId: String(7000000 + i), likedAt: 1_700_000_000_000 - i * 1000 }));
  const index = buildIndex({ source: 'tiktok', adapter: 'portability', accountLabel: 'x', syncedAt: 1 }, likes);

  it('speichert nur ID und Datum', () => {
    expect(Object.keys(index.likes[0]!)).toEqual(['id', 't']);
  });

  it('wählt 40 Kandidaten ohne ausgeschlossene und kürzlich gespielte Clips', () => {
    const excluded = new Set(['7000000', '7000001']);
    const recent = new Set(['7000002']);
    const c = selectCandidates(index, { excluded, recentPlayed: recent, max: 40 });
    expect(c).toHaveLength(40);
    const ids = new Set(c.map((x) => x.videoId));
    expect(ids.size).toBe(40);
    for (const id of [...excluded, ...recent]) expect(ids.has(id)).toBe(false);
  });

  it('hasht deterministisch mit Raum-Salz', async () => {
    const a = await hashVideoId('salt1', '7000000');
    expect(a).toMatch(/^[a-f0-9]{16}$/);
    expect(await hashVideoId('salt1', '7000000')).toBe(a);
    expect(await hashVideoId('salt2', '7000000')).not.toBe(a);
  });
});

describe('Experimenteller Web-Adapter (Linklogik)', () => {
  it('verwirft eigene Uploads und fremde Hosts', () => {
    expect(
      likesFromVisibleLinks(
        [
          'https://www.tiktok.com/@ich/video/7400000000000000001',
          'https://www.tiktok.com/@andere/video/7400000000000000002',
          'https://www.tiktok.com/@andere/video/7400000000000000002',
          'https://example.com/@x/video/7400000000000000003'
        ],
        '@Ich'
      )
    ).toEqual(['7400000000000000002']);
  });
});

describe('Demo-Adapter', () => {
  it('erzeugt stabile, eindeutig markierte IDs', () => {
    const a = demoLikes('seed', 30);
    expect(a.every((l) => /^demo-[a-z0-9]{4,32}$/.test(l.videoId))).toBe(true);
    expect(new Set(a.map((l) => l.videoId)).size).toBe(30);
    expect(demoLikes('seed', 30).map((l) => l.videoId)).toEqual(a.map((l) => l.videoId));
    expect(demoClipLook(a[0]!.videoId).durationSec).toBeGreaterThan(8);
  });
});
