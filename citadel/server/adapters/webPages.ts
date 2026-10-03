// Einzelne Webseiten mit möglichen Settings-Angaben (Spieler-Homepages, Treffer des Suchanbieters).
// Beachtet robots.txt. Zuordnung zum Spieler nur bei Beleg:
//  - Seite liegt auf einer belegten Identität des Spielers → Primärquelle
//  - Drittseite verlinkt eine belegte Identität des Spielers → Drittanbieterangabe
//  - sonst: nur ungeklärter Kandidat (player_hint), keine Veröffentlichung

import type { Adapter, AdapterContext, JobOutcome, JobRow } from './types.ts';
import { all, get } from '../db.ts';
import { playerForUrl, recordObservation } from '../pipeline/store.ts';
import { extractByRules, htmlToText, mentionsDeadlock, EXTRACTOR_VERSION } from '../extract/rules.ts';
import { EXTRACTOR_VERSION_AI } from '../extract/ai.ts';
import { FetchError } from '../net/fetcher.ts';
import { markSourceGone } from '../pipeline/store.ts';

interface PagePayload {
  url: string;
  /** Spieler, für den gesucht wurde (nur Hinweis, kein Beleg). */
  playerHintId?: string;
}

function extractPublishedDate(html: string): string | null {
  const m =
    /<meta[^>]+(?:property|name)=["'](?:article:modified_time|article:published_time|date|dc\.date)["'][^>]+content=["']([^"']+)["']/i.exec(html) ||
    /<time[^>]+datetime=["']([^"']+)["']/i.exec(html);
  if (!m) return null;
  const t = Date.parse(m[1]);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function pageLinksIdentity(html: string, identityUrls: string[]): string | null {
  const low = html.toLowerCase();
  for (const u of identityUrls) {
    try {
      const x = new URL(u);
      const needle = (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase();
      if (needle.length > 8 && low.includes(needle)) return u;
    } catch {
      /* ignorieren */
    }
  }
  return null;
}

export async function processPage(ctx: AdapterContext, p: PagePayload) {
  let res;
  try {
    res = await ctx.fetcher.fetch(p.url, { respectRobots: true, accept: 'text/html,text/plain', minIntervalMs: 3000 });
  } catch (e) {
    if (e instanceof FetchError && (e.status === 404 || e.status === 410)) {
      const n = markSourceGone(ctx.db, p.url);
      return { observations: 0, skipped: `Quelle verschwunden (${e.status}), ${n} Werte markiert` };
    }
    throw e;
  }
  if (res.notModified) return { observations: 0, skipped: 'unverändert' };
  const isHtml = /html/i.test(res.contentType) || /<html/i.test(res.body.slice(0, 500));
  const text = isHtml ? htmlToText(res.body) : res.body;
  const publishedAt = isHtml ? extractPublishedDate(res.body) : null;

  // Zuordnung
  let playerId = playerForUrl(ctx.db, res.finalUrl) || playerForUrl(ctx.db, p.url);
  let sourceType: 'primary' | 'third-party' = 'primary';
  let hint: string | null = null;
  if (!playerId && p.playerHintId) {
    const urls = all<{ url: string }>(ctx.db, 'SELECT url FROM identities WHERE player_id = ? AND url IS NOT NULL', p.playerHintId).map((r) => r.url);
    const name = get<{ display_name: string }>(ctx.db, 'SELECT display_name FROM players WHERE id = ?', p.playerHintId)?.display_name || '';
    const linked = pageLinksIdentity(res.body, urls);
    if (linked && text.toLowerCase().includes(name.toLowerCase())) {
      playerId = p.playerHintId;
      sourceType = 'third-party';
    } else hint = `${name} (nur Namens-/Suchtreffer, keine belegte Verlinkung)`;
  }
  if (!mentionsDeadlock(text)) return { observations: 0, skipped: 'Seite erwähnt Deadlock nicht' };

  let cands = extractByRules(text, { publishedAt });
  let extractor = EXTRACTOR_VERSION;
  if (!cands.length && ctx.ai && playerId) {
    const name = get<{ display_name: string }>(ctx.db, 'SELECT display_name FROM players WHERE id = ?', playerId)!.display_name;
    const r = await ctx.ai.extract({ url: res.finalUrl, contentHash: res.contentHash, text, playerName: name, publishedAt });
    if (r) {
      cands = r.candidates;
      extractor = EXTRACTOR_VERSION_AI;
      for (const d of r.dropped) ctx.log(`AI-Kandidat verworfen (${res.finalUrl}): ${d}`);
    }
  }
  let n = 0;
  for (const c of cands) {
    recordObservation(ctx.db, {
      ...c,
      playerId,
      playerHint: playerId ? null : hint,
      sourceId: ctx.source.id,
      sourceUrl: res.finalUrl,
      sourceType,
      origin: sourceType === 'primary' ? 'auto-primary' : 'third-party',
      retrievedAt: res.fetchedAt,
      extractorVersion: extractor,
      contentHash: res.contentHash,
    });
    n++;
  }
  return { observations: n, skipped: null };
}

export const webPages: Adapter = {
  id: 'web-pages',
  description: 'Spieler-Homepages und Suchtreffer (robots.txt wird beachtet)',
  terms: 'Nur öffentlich erreichbare Seiten, robots.txt wird beachtet, 1 Anfrage / 3 s je Host. Keine Logins, keine Zugangssperren.',
  minIntervalMs: 3000,
  missingRequirement: () => null,
  async run(ctx, job: JobRow): Promise<JobOutcome> {
    if (job.kind === 'page') {
      const p = JSON.parse(job.payload) as PagePayload;
      const r = await processPage(ctx, p);
      return { summary: r.skipped ? `${p.url}: ${r.skipped}` : `${p.url}: ${r.observations} Kandidaten`, stats: { observations: r.observations } };
    }
    // Quellenlauf: Homepages aller Spieler als Seitenjobs einreihen
    const homes = all<{ player_id: string; url: string }>(ctx.db, "SELECT player_id, url FROM identities WHERE platform = 'homepage' AND url IS NOT NULL");
    for (const h of homes) ctx.enqueue(ctx.source.id, 'page', { url: h.url }, `page:${h.url}`);
    return { summary: `${homes.length} Homepages eingereiht`, stats: { queued: homes.length } };
  },
};
