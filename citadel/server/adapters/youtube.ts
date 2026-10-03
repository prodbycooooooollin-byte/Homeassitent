// Videobeschreibungen aus belegten YouTube-Kanälen von Spielern (YouTube Data API v3, API-Schlüssel).
// Es werden nur öffentliche Beschreibungen gelesen (videos.list snippet) – keine Untertitel
// (captions.download erfordert Bearbeitungsrechte am Video).

import type { Adapter } from './types.ts';
import { all } from '../db.ts';
import { recordObservation } from '../pipeline/store.ts';
import { extractByRules, EXTRACTOR_VERSION } from '../extract/rules.ts';

export const youtube: Adapter = {
  id: 'youtube',
  description: 'Beschreibungen neuer Deadlock-Videos auf belegten Spielerkanälen',
  terms: 'YouTube Data API v3 (Kontingent 10.000 Einheiten/Tag Standard). Nur öffentliche Metadaten; keine Untertitel fremder Videos.',
  minIntervalMs: 500,
  missingRequirement: (cfg) => (cfg.youtubeKey ? null : 'YOUTUBE_API_KEY fehlt – YouTube-Quelle inaktiv'),
  async run(ctx) {
    const key = ctx.cfg.youtubeKey!;
    const base = 'https://www.googleapis.com/youtube/v3';
    const chans = all<{ player_id: string; handle: string; url: string }>(ctx.db, "SELECT player_id, handle, url FROM identities WHERE platform = 'youtube' AND url IS NOT NULL");
    let obs = 0;
    for (const c of chans) {
      const h = c.handle.replace(/^.*youtube\.com\//, '');
      const q = h.startsWith('channel/') ? `id=${encodeURIComponent(h.slice(8))}` : `forHandle=${encodeURIComponent(h.startsWith('@') ? h : '@' + h)}`;
      const { data: ch } = await ctx.fetcher.json<{ items?: { contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(`${base}/channels?part=contentDetails&${q}&key=${key}`, { minIntervalMs: this.minIntervalMs, conditional: false });
      const uploads = ch.items?.[0]?.contentDetails.relatedPlaylists.uploads;
      if (!uploads) continue;
      const { data: pl } = await ctx.fetcher.json<{ items?: { contentDetails: { videoId: string } }[] }>(`${base}/playlistItems?part=contentDetails&maxResults=10&playlistId=${uploads}&key=${key}`, { minIntervalMs: this.minIntervalMs, conditional: false });
      const ids = (pl.items || []).map((i) => i.contentDetails.videoId);
      if (!ids.length) continue;
      const { data: vids, result } = await ctx.fetcher.json<{ items?: { id: string; snippet: { title: string; description: string; publishedAt: string } }[] }>(`${base}/videos?part=snippet&id=${ids.join(',')}&key=${key}`, {
        minIntervalMs: this.minIntervalMs,
        conditional: false,
      });
      for (const v of vids.items || []) {
        const text = `${v.snippet.title}\n${v.snippet.description}`;
        if (!/deadlock/i.test(text)) continue;
        for (const cand of extractByRules(text, { publishedAt: v.snippet.publishedAt })) {
          recordObservation(ctx.db, {
            ...cand,
            playerId: c.player_id,
            sourceId: ctx.source.id,
            sourceUrl: `https://www.youtube.com/watch?v=${v.id}`,
            sourceType: 'primary',
            origin: 'auto-primary',
            retrievedAt: result.fetchedAt,
            extractorVersion: EXTRACTOR_VERSION,
            contentHash: result.contentHash,
          });
          obs++;
        }
      }
    }
    return { summary: `${chans.length} Kanäle geprüft, ${obs} Kandidaten`, stats: { channels: chans.length, observations: obs } };
  },
};
