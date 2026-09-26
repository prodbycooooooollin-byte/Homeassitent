import { describe, expect, it } from 'vitest';
import { buildQueues, cleanPools, createRng, pickMixed } from '../src/index.js';
import { normalizeTikTokVideoId } from '@liked/protocol';

const hash = (id: string) => `h${id}`.padEnd(16, '0').slice(0, 16);

describe('Normalisierung', () => {
  it('erkennt gängige Linkformen und lehnt fremde Hosts ab', () => {
    expect(normalizeTikTokVideoId('https://www.tiktok.com/@a.b/video/7234567890123456789?lang=de')).toBe('7234567890123456789');
    expect(normalizeTikTokVideoId('https://www.tiktokv.com/share/video/7234567890123456789/')).toBe('7234567890123456789');
    expect(normalizeTikTokVideoId('https://m.tiktok.com/v/7234567890123456789.html')).toBe('7234567890123456789');
    expect(normalizeTikTokVideoId('https://evil.example/video/7234567890123456789')).toBeNull();
    expect(normalizeTikTokVideoId('https://vm.tiktok.com/ZMabc/')).toBeNull();
    expect(normalizeTikTokVideoId('javascript:alert(1)')).toBeNull();
  });
});

describe('Überschneidungen (Abnahme 12)', () => {
  it('schließt IDs aus, die in mehreren Pools oder im Index anderer vorkommen, und dedupliziert', () => {
    const { cleaned, report } = cleanPools(
      [
        {
          playerId: 'a',
          source: 'tiktok',
          candidates: [
            { videoId: 'https://www.tiktok.com/@x/video/1000001' },
            { videoId: '1000001' },
            { videoId: '1000002' },
            { videoId: '1000003' }
          ],
          indexHashes: new Set()
        },
        {
          playerId: 'b',
          source: 'tiktok',
          candidates: [{ videoId: '1000002' }, { videoId: '2000001' }],
          indexHashes: new Set([hash('1000003')])
        }
      ],
      hash,
      new Set(['2000001'])
    );
    expect(cleaned.get('a')!.map((c) => c.videoId)).toEqual(['1000001']);
    expect(cleaned.get('b')!.map((c) => c.videoId)).toEqual([]);
    expect(report.excludedByOverlap.get('a')).toBe(2);
  });

  it('akzeptiert Demo-IDs nur in Demo-Pools', () => {
    const { cleaned } = cleanPools(
      [{ playerId: 'a', source: 'tiktok', candidates: [{ videoId: 'demo-abcd' }], indexHashes: new Set() }],
      hash
    );
    expect(cleaned.get('a')).toEqual([]);
  });
});

describe('Mischung neuer/älterer Likes', () => {
  it('nimmt aus beiden Hälften', () => {
    const cands = Array.from({ length: 40 }, (_, i) => ({ videoId: String(1000000 + i), likedAt: i * 1000 }));
    const picked = pickMixed(cands, 10, createRng(1));
    expect(picked).toHaveLength(10);
    const newer = picked.filter((c) => c.likedAt! >= 20000).length;
    expect(newer).toBe(5);
    expect(new Set(picked.map((c) => c.videoId)).size).toBe(10);
  });
  it('baut Queues mit gewerteten und Ersatzclips', () => {
    const q = buildQueues(
      new Map([['a', Array.from({ length: 20 }, (_, i) => ({ videoId: String(5000000 + i) }))]]),
      new Map([['a', 'tiktok' as const]]),
      5,
      3,
      createRng(9)
    );
    expect(q.get('a')!.queue).toHaveLength(8);
    expect(q.get('a')!.usable).toBe(20);
  });
});
