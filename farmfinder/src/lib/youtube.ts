import { buildFarm, type RawVideo } from './analyze';
import type { Farm } from './types';

const API = 'https://www.googleapis.com/youtube/v3';

export function parseVideoId(input: string): string | undefined {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1, 12) || undefined;
    const v = u.searchParams.get('v');
    if (v) return v.slice(0, 11);
    const m = u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{11})/);
    return m?.[1];
  } catch {
    return undefined;
  }
}

export function parseDuration(iso: string): number {
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [d, h, mi, s] = [m[1], m[2], m[3], m[4]].map((x) => parseInt(x ?? '0', 10));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

interface VideoResource {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    channelId?: string;
    description: string;
    publishedAt: string;
    thumbnails?: Record<string, { url: string }>;
  };
  statistics?: { viewCount?: string; likeCount?: string };
  contentDetails?: { duration?: string };
}

export function toRaw(v: VideoResource): RawVideo {
  const th = v.snippet.thumbnails ?? {};
  return {
    videoId: v.id,
    title: decodeEntities(v.snippet.title),
    channel: decodeEntities(v.snippet.channelTitle),
    channelId: v.snippet.channelId,
    description: v.snippet.description ?? '',
    publishedAt: v.snippet.publishedAt,
    thumbnail: (th.medium ?? th.high ?? th.default)?.url ?? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
    views: v.statistics?.viewCount ? +v.statistics.viewCount : undefined,
    likes: v.statistics?.likeCount ? +v.statistics.likeCount : undefined,
    durationSec: v.contentDetails?.duration ? parseDuration(v.contentDetails.duration) : undefined,
  };
}

async function call<T>(path: string, params: Record<string, string>, key: string, signal?: AbortSignal): Promise<T> {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key })}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    let msg = `YouTube-API-Fehler ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error?.message) msg += `: ${body.error.message}`;
    } catch { /* kein JSON */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/** Sucht Videos (100 Quota-Einheiten) und lädt Details (1 Einheit) in einem Rutsch. */
export async function searchFarms(query: string, key: string, signal?: AbortSignal): Promise<Farm[]> {
  const search = await call<{ items: { id: { videoId?: string } }[] }>(
    'search',
    { part: 'id', type: 'video', q: query, maxResults: '25', videoEmbeddable: 'true', safeSearch: 'moderate' },
    key,
    signal,
  );
  const ids = search.items.map((i) => i.id.videoId).filter(Boolean) as string[];
  if (!ids.length) return [];
  return fetchVideos(ids, key, signal);
}

export async function fetchVideos(ids: string[], key: string, signal?: AbortSignal): Promise<Farm[]> {
  const res = await call<{ items: VideoResource[] }>(
    'videos',
    { part: 'snippet,statistics,contentDetails', id: ids.join(',') },
    key,
    signal,
  );
  return res.items.map((v) => buildFarm(toRaw(v)));
}

/** Ohne API-Key: Titel/Kanal per oEmbed (falls erreichbar), sonst Platzhalter. */
export async function manualFarm(input: string): Promise<Farm | undefined> {
  const id = parseVideoId(input);
  if (!id) return undefined;
  let title = 'Eigenes Video';
  let channel = '';
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
    if (r.ok) {
      const j = await r.json();
      title = j.title ?? title;
      channel = j.author_name ?? '';
    }
  } catch { /* CORS/offline – Platzhalter genügt */ }
  return { ...buildFarm({ videoId: id, title, channel, description: '', thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` }), manual: true };
}

export const youtubeSearchUrl = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

interface CommentThread {
  snippet: { topLevelComment: { snippet: { textDisplay: string; authorChannelId?: { value: string } } } };
}

/** Kommentare mit Materiallisten – Ersteller-Kommentare zuerst (angeheftete Kommentare stehen meist oben). */
export async function fetchComments(videoId: string, key: string, channelId?: string, signal?: AbortSignal): Promise<string[]> {
  const res = await call<{ items: CommentThread[] }>(
    'commentThreads',
    { part: 'snippet', videoId, order: 'relevance', maxResults: '20', textFormat: 'plainText' },
    key,
    signal,
  );
  const all = res.items.map((i) => i.snippet.topLevelComment.snippet);
  const own = all.filter((c) => channelId && c.authorChannelId?.value === channelId);
  return [...own, ...all.filter((c) => !own.includes(c))].map((c) => decodeEntities(c.textDisplay));
}
