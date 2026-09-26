import { normalizeTikTokVideoId, type Candidate, type ClipRef, type ClipSource } from '@liked/protocol';
import { shuffle, type Rng } from './rng.js';

export interface PlayerPoolInput {
  playerId: string;
  source: ClipSource;
  candidates: readonly Candidate[];
  /** Gesalzene Hashes des vollständigen Index dieses Spielers. */
  indexHashes: ReadonlySet<string>;
}

export interface SelectedPool {
  playerId: string;
  /** Reihenfolge, in der Clips gezogen werden: zuerst gewertete, dann Ersatz. */
  queue: ClipRef[];
  usable: number;
}

export interface OverlapReport {
  /** Anzahl verworfener Kandidaten je Spieler (ohne IDs). */
  excludedByOverlap: Map<string, number>;
}

/** Normalisiert eine Kandidaten-ID passend zur Quelle. */
export function normalizeCandidateId(source: ClipSource, raw: string): string | null {
  if (source === 'demo') return /^demo-[a-z0-9]{4,32}$/.test(raw) ? raw : null;
  return normalizeTikTokVideoId(raw);
}

/**
 * Normalisiert, dedupliziert und schließt Überschneidungen aus:
 *  - Eine ID, die in mehreren Kandidatenlisten steht, fällt überall heraus.
 *  - Eine ID, deren Hash im Index eines anderen Spielers auftaucht, fällt heraus.
 *  - Bereits in diesem Raum gespielte IDs fallen heraus.
 * Vollständigkeit ist nur so gut wie die übermittelten Indexe.
 */
export function cleanPools(
  pools: readonly PlayerPoolInput[],
  hashId: (id: string) => string,
  alreadyPlayed: ReadonlySet<string> = new Set()
): { cleaned: Map<string, Candidate[]>; report: OverlapReport } {
  const normalized = new Map<string, Candidate[]>();
  const occurrences = new Map<string, number>();
  for (const pool of pools) {
    const seen = new Set<string>();
    const list: Candidate[] = [];
    for (const c of pool.candidates) {
      const id = normalizeCandidateId(pool.source, c.videoId);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      list.push({ videoId: id, likedAt: c.likedAt });
    }
    normalized.set(pool.playerId, list);
    for (const id of seen) occurrences.set(id, (occurrences.get(id) ?? 0) + 1);
  }

  const excludedByOverlap = new Map<string, number>();
  const cleaned = new Map<string, Candidate[]>();
  for (const pool of pools) {
    const others = pools.filter((p) => p.playerId !== pool.playerId);
    let excluded = 0;
    const keep: Candidate[] = [];
    for (const c of normalized.get(pool.playerId) ?? []) {
      if (alreadyPlayed.has(c.videoId)) continue;
      const shared =
        (occurrences.get(c.videoId) ?? 0) > 1 ||
        others.some((o) => o.indexHashes.size > 0 && o.indexHashes.has(hashId(c.videoId)));
      if (shared) {
        excluded++;
        continue;
      }
      keep.push(c);
    }
    cleaned.set(pool.playerId, keep);
    excludedByOverlap.set(pool.playerId, excluded);
  }
  return { cleaned, report: { excludedByOverlap } };
}

/**
 * Wählt je Person `clipsPerPerson + spares` Clips mit Mischung aus neueren und
 * älteren Likes (sofern Daten vorhanden). Ohne Datum wird rein zufällig gewählt.
 */
export function pickMixed(candidates: readonly Candidate[], count: number, rng: Rng): Candidate[] {
  if (candidates.length <= count) return shuffle(candidates, rng);
  const dated = candidates.filter((c) => c.likedAt !== undefined).sort((a, b) => b.likedAt! - a.likedAt!);
  const undated = candidates.filter((c) => c.likedAt === undefined);
  if (dated.length < 4) return shuffle(candidates, rng).slice(0, count);
  const half = Math.ceil(dated.length / 2);
  const newer = shuffle(dated.slice(0, half), rng);
  const older = shuffle([...dated.slice(half), ...undated], rng);
  const out: Candidate[] = [];
  while (out.length < count && (newer.length || older.length)) {
    const takeNewer = out.length % 2 === 0 ? newer.length > 0 : older.length === 0;
    out.push((takeNewer ? newer : older).shift()!);
  }
  return shuffle(out, rng);
}

export function buildQueues(
  cleaned: ReadonlyMap<string, Candidate[]>,
  sources: ReadonlyMap<string, ClipSource>,
  clipsPerPerson: number,
  spares: number,
  rng: Rng
): Map<string, SelectedPool> {
  const out = new Map<string, SelectedPool>();
  for (const [playerId, list] of cleaned) {
    const source = sources.get(playerId) ?? 'tiktok';
    const picked = pickMixed(list, clipsPerPerson + spares, rng);
    out.set(playerId, {
      playerId,
      usable: list.length,
      queue: picked.map((c) => ({ source, videoId: c.videoId }) as ClipRef)
    });
  }
  return out;
}
