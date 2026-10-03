import { MAX_CANDIDATES, MAX_INDEX_HASHES, type Candidate } from '@liked/protocol';
import type { AdapterId } from './sync-state.js';

/** Lokaler, begrenzter Like-Index: nur ID und Datum, sonst nichts. */
export interface LikeIndex {
  version: 1;
  source: 'tiktok' | 'demo';
  adapter: AdapterId;
  accountLabel: string;
  syncedAt: number;
  likes: { id: string; t?: number }[];
}

export const MAX_INDEX_ENTRIES = 5000;
export const MAX_RECENT_PLAYED = 500;

export function buildIndex(
  params: Omit<LikeIndex, 'version' | 'likes'>,
  likes: readonly { videoId: string; likedAt?: number }[]
): LikeIndex {
  const seen = new Set<string>();
  const out: LikeIndex['likes'] = [];
  const sorted = [...likes].sort((a, b) => (b.likedAt ?? 0) - (a.likedAt ?? 0));
  for (const l of sorted) {
    if (seen.has(l.videoId)) continue;
    seen.add(l.videoId);
    out.push(l.likedAt !== undefined ? { id: l.videoId, t: l.likedAt } : { id: l.videoId });
    if (out.length >= MAX_INDEX_ENTRIES) break;
  }
  return { version: 1, ...params, likes: out };
}

/**
 * Kandidaten für eine Partie: kürzlich gespielte und privat ausgeschlossene IDs
 * werden übersprungen (falls danach zu wenige bleiben, werden kürzlich gespielte
 * wieder zugelassen). Mischung aus neueren und älteren Likes.
 */
export function selectCandidates(
  index: LikeIndex,
  opts: { recentPlayed: ReadonlySet<string>; excluded: ReadonlySet<string>; max?: number; random?: () => number }
): Candidate[] {
  const max = Math.min(opts.max ?? 40, MAX_CANDIDATES);
  const rnd = opts.random ?? Math.random;
  const allowed = index.likes.filter((l) => !opts.excluded.has(l.id));
  let pool = allowed.filter((l) => !opts.recentPlayed.has(l.id));
  if (pool.length < 15) pool = allowed;
  const half = Math.ceil(pool.length / 2);
  const pick = (arr: typeof pool, n: number) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a.slice(0, n);
  };
  const newer = pick(pool.slice(0, half), Math.ceil(max / 2));
  const older = pick(pool.slice(half), max - newer.length);
  const chosen = [...newer, ...older];
  if (chosen.length < max) {
    const ids = new Set(chosen.map((c) => c.id));
    chosen.push(...pick(pool.filter((l) => !ids.has(l.id)), max - chosen.length));
  }
  return chosen.map((l) => (l.t !== undefined ? { videoId: l.id, likedAt: l.t } : { videoId: l.id }));
}

/** HMAC-SHA256(salt, id) → 16 Hex-Zeichen. Web Crypto (Electron-Renderer und Node ≥ 20). */
export async function hashVideoId(salt: string, id: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(id)));
  return [...sig.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function indexHashes(index: LikeIndex, salt: string): Promise<string[]> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const out: string[] = [];
  for (const l of index.likes.slice(0, MAX_INDEX_HASHES)) {
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(l.id)));
    out.push([...sig.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join(''));
  }
  return out;
}

export function pushRecentPlayed(list: readonly string[], ids: readonly string[]): string[] {
  const set = new Set(ids);
  return [...ids, ...list.filter((id) => !set.has(id))].slice(0, MAX_RECENT_PLAYED);
}
