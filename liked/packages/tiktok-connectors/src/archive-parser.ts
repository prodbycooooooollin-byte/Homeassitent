import { createReadStream } from 'node:fs';
import { open as openFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import yauzl from 'yauzl';
import { parser as jsonParser } from 'stream-json/parser.js';
import { normalizeTikTokVideoId } from '@liked/protocol';

/**
 * Extrahiert ausschließlich die „Like List“ aus einem TikTok-Datenarchiv
 * (Data Portability API, data_format=json, bzw. ZIP mit JSON).
 *
 * Bekannte Struktur (TikTok-Datenexport, Stand der Recherche):
 *   { "Activity" | "Your Activity": { "Like List": { "ItemFavoriteList": [ { "Date": "...", "Link": "..." } ] } } }
 * Achtung: „Favorite Videos“ sind Lesezeichen, KEINE Likes, und werden ignoriert.
 * Eigene Uploads („Video“/„Posts“) werden ebenfalls ignoriert.
 *
 * Verarbeitung im Datenstrom: Es wird weder das gesamte JSON im Speicher gehalten
 * noch irgendein anderer Abschnitt (Nachrichten, Suchverlauf, …) gespeichert.
 */
export interface ExtractedLike {
  videoId: string;
  likedAt?: number;
}

export interface ExtractOptions {
  /** Obergrenze gesammelter Likes (Speicherschutz). */
  maxLikes?: number;
  /** Obergrenze entpackter Bytes je JSON-Eintrag. */
  maxEntryBytes?: number;
}

const LIKE_SECTION = /^like\s*list$/i;
const DATE_KEYS = new Set(['date', 'likedate', 'time']);
const LINK_KEYS = new Set(['link', 'videolink', 'url', 'video link']);

export function parseTikTokDate(raw: string): number | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

type Frame = { type: 'object' | 'array'; key: string | null; likeDepth: boolean };

/** Token-basierter Extraktor – nutzbar für Streams und für Tests. */
export class LikeListCollector {
  readonly likes = new Map<string, ExtractedLike>();
  private stack: Frame[] = [];
  private pendingKey: string | null = null;
  private record: { date?: string; link?: string } | null = null;
  private recordDepth = -1;
  constructor(private readonly maxLikes = 20_000) {}

  private insideLikeList(): boolean {
    return this.stack.some((f) => f.likeDepth);
  }

  token(t: { name: string; value?: unknown }): void {
    switch (t.name) {
      case 'keyValue':
        this.pendingKey = String(t.value);
        return;
      case 'startObject':
      case 'startArray': {
        const key = this.pendingKey;
        this.pendingKey = null;
        const likeDepth = key !== null && LIKE_SECTION.test(key.replace(/\s+/g, ' ').trim());
        this.stack.push({ type: t.name === 'startObject' ? 'object' : 'array', key, likeDepth });
        const parent = this.stack[this.stack.length - 2];
        if (t.name === 'startObject' && parent?.type === 'array' && this.insideLikeList() && !this.record) {
          this.record = {};
          this.recordDepth = this.stack.length;
        }
        return;
      }
      case 'endObject':
      case 'endArray': {
        if (this.record && this.stack.length === this.recordDepth) {
          this.commit(this.record);
          this.record = null;
          this.recordDepth = -1;
        }
        this.stack.pop();
        this.pendingKey = null;
        return;
      }
      case 'stringValue': {
        const key = this.pendingKey?.toLowerCase().trim() ?? null;
        this.pendingKey = null;
        if (this.record && key && this.stack.length === this.recordDepth) {
          if (DATE_KEYS.has(key)) this.record.date = String(t.value);
          else if (LINK_KEYS.has(key)) this.record.link = String(t.value);
        }
        return;
      }
      case 'numberValue':
      case 'nullValue':
      case 'trueValue':
      case 'falseValue':
        this.pendingKey = null;
        return;
      default:
        return;
    }
  }

  private commit(r: { date?: string; link?: string }): void {
    if (!r.link || this.likes.size >= this.maxLikes) return;
    const id = normalizeTikTokVideoId(r.link);
    if (!id || this.likes.has(id)) return;
    this.likes.set(id, { videoId: id, likedAt: r.date ? parseTikTokDate(r.date) : undefined });
  }

  result(): ExtractedLike[] {
    return [...this.likes.values()].sort((a, b) => (b.likedAt ?? 0) - (a.likedAt ?? 0));
  }
}

function collectFromStream(input: Readable, collector: LikeListCollector, maxBytes: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const p = jsonParser.asStream({ packValues: true, streamValues: false });
    input.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        input.destroy(new Error('Archiveintrag zu groß'));
      }
    });
    input.on('error', reject);
    p.on('data', (tok: { name: string; value?: unknown }) => collector.token(tok));
    p.on('error', reject);
    p.on('end', () => resolve());
    input.pipe(p);
  });
}

async function isZip(path: string): Promise<boolean> {
  const fh = await openFile(path, 'r');
  try {
    const buf = Buffer.alloc(4);
    await fh.read(buf, 0, 4, 0);
    return buf[0] === 0x50 && buf[1] === 0x4b;
  } finally {
    await fh.close();
  }
}

/** Liest eine heruntergeladene Archivdatei (ZIP oder JSON) und liefert nur Likes. */
export async function extractLikesFromArchiveFile(path: string, opts: ExtractOptions = {}): Promise<ExtractedLike[]> {
  const collector = new LikeListCollector(opts.maxLikes);
  const maxBytes = opts.maxEntryBytes ?? 2 * 1024 * 1024 * 1024;
  if (!(await isZip(path))) {
    await collectFromStream(createReadStream(path), collector, maxBytes);
    return collector.result();
  }
  await new Promise<void>((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('ZIP nicht lesbar'));
      zip.on('error', reject);
      zip.on('end', () => resolve());
      zip.on('entry', (entry: yauzl.Entry) => {
        if (!/\.json$/i.test(entry.fileName) || /\/$/.test(entry.fileName)) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (e2, stream) => {
          if (e2 || !stream) return reject(e2 ?? new Error('Eintrag nicht lesbar'));
          collectFromStream(stream, collector, maxBytes).then(() => zip.readEntry(), reject);
        });
      });
      zip.readEntry();
    });
  });
  return collector.result();
}
