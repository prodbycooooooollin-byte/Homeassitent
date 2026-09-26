import { describe, expect, it } from 'vitest';
import { buildTikTokEmbedUrl, C2S, DisplayNameSchema, PoolSubmissionSchema } from '../src/index.js';

describe('Embed-URL', () => {
  it('nutzt nur den offiziellen Player, keine Empfehlungen/Beschreibung', () => {
    const u = new URL(buildTikTokEmbedUrl('7300000000000000001'));
    expect(u.origin).toBe('https://www.tiktok.com');
    expect(u.pathname).toBe('/player/v1/7300000000000000001');
    expect(u.searchParams.get('rel')).toBe('0');
    expect(u.searchParams.get('description')).toBe('0');
    expect(u.searchParams.get('music_info')).toBe('0');
  });
  it('lehnt beliebige Eingaben ab (kein URL-Durchreichen)', () => {
    expect(() => buildTikTokEmbedUrl('https://evil.example')).toThrow();
    expect(() => buildTikTokEmbedUrl('123/../../x')).toThrow();
  });
});

describe('Schemata', () => {
  it('validiert Namen', () => {
    expect(DisplayNameSchema.safeParse('  Mia   Sophie ').data).toBe('Mia Sophie');
    expect(DisplayNameSchema.safeParse('a').success).toBe(false);
    expect(DisplayNameSchema.safeParse('x'.repeat(21)).success).toBe(false);
    expect(DisplayNameSchema.safeParse('Evil‮Name').success).toBe(false);
  });
  it('begrenzt Pool-Größen', () => {
    const big = { source: 'tiktok', candidates: Array.from({ length: 61 }, (_, i) => ({ videoId: String(1000000 + i) })), indexHashes: [], totalAvailable: 1 };
    expect(PoolSubmissionSchema.safeParse(big).success).toBe(false);
  });
  it('Stimmen brauchen Idempotenzkennung und gültige Spieler-ID', () => {
    expect(C2S.vote.safeParse({ roundId: 'rd_x', targetId: 'p_abcdefgh', voteId: 'short' }).success).toBe(false);
    expect(C2S.vote.safeParse({ roundId: 'rd_x', targetId: 'p_abcdefgh', voteId: crypto.randomUUID() }).success).toBe(true);
    expect(C2S.vote.safeParse({ roundId: 'rd_x', targetId: 'owner', voteId: crypto.randomUUID() }).success).toBe(false);
  });
});
