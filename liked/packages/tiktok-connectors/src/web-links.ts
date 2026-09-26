import { normalizeTikTokVideoId } from '@liked/protocol';

/**
 * Hilfslogik für den EXPERIMENTELLEN lokalen Web-Adapter (nicht freigeschaltet).
 * Aus sichtbaren Links des „Gefällt mir“-Reiters werden nur Video-IDs übernommen.
 * Videos, deren Link-Autor der eigene Account ist, werden verworfen, damit eigene
 * Uploads nicht als Likes gelten.
 */
export function likesFromVisibleLinks(hrefs: readonly string[], ownHandle: string | null): string[] {
  const own = ownHandle?.replace(/^@/, '').toLowerCase() ?? null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const href of hrefs) {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    const author = /^\/@([^/]+)\/video\//.exec(url.pathname)?.[1]?.toLowerCase() ?? null;
    if (own && author === own) continue;
    const id = normalizeTikTokVideoId(href);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
