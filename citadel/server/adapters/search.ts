// Konfigurierbarer Suchanbieter (Brave Search API). Suchtreffer dienen nur zum Auffinden;
// übernommen wird ausschließlich, was beim Abruf der eigentlichen Seite belegt ist (webPages).

import type { Adapter } from './types.ts';
import { all, get, nowIso, run } from '../db.ts';

interface BraveResult {
  web?: { results?: { url: string; title: string; description?: string; age?: string }[] };
}

export function buildQueries(name: string): string[] {
  const n = `"${name.replace(/"/g, '')}"`;
  return [`${n} deadlock crosshair`, `${n} deadlock sensitivity dpi settings`];
}

export const braveSearch: Adapter = {
  id: 'brave-search',
  description: 'Suche nach Settings-Quellen für bekannte Spieler (Brave Search API)',
  terms: 'Kostenpflichtige API mit Kontingent; Schlüssel nur serverseitig (BRAVE_SEARCH_API_KEY). Snippets werden nicht als Beleg genutzt.',
  minIntervalMs: 1100,
  missingRequirement: (cfg) => (cfg.braveKey ? null : 'BRAVE_SEARCH_API_KEY fehlt – automatische Suche inaktiv'),
  async run(ctx) {
    const perRun = Number(ctx.sourceConfig.playersPerRun || 10);
    const players = all<{ id: string; display_name: string }>(
      ctx.db,
      `SELECT id, display_name FROM players WHERE is_demo = 0 AND category IN ('pro','high-rank')
       ORDER BY ifnull((SELECT v FROM meta WHERE k = 'search:' || players.id), '') ASC, CASE category WHEN 'pro' THEN 0 ELSE 1 END LIMIT ?`,
      perRun,
    );
    let queued = 0;
    for (const p of players) {
      for (const q of buildQueries(p.display_name)) {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5&freshness=py`;
        const { data } = await ctx.fetcher.json<BraveResult>(url, { headers: { 'x-subscription-token': ctx.cfg.braveKey! }, minIntervalMs: this.minIntervalMs, conditional: false });
        for (const r of data.web?.results || []) {
          if (!/^https:\/\//.test(r.url)) continue;
          ctx.enqueue('web-pages', 'page', { url: r.url, playerHintId: p.id }, `page:${r.url}`);
          queued++;
        }
      }
      run(ctx.db, 'INSERT INTO meta(k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', `search:${p.id}`, nowIso());
    }
    const total = get<{ n: number }>(ctx.db, 'SELECT count(*) n FROM players WHERE is_demo = 0')!.n;
    return { summary: `${players.length} Spieler gesucht (von ${total}), ${queued} Seiten eingereiht`, stats: { players: players.length, queued } };
  },
};
