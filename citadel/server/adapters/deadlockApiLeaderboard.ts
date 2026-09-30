// Spielerentdeckung über die öffentliche Deadlock-API-Rangliste (api.deadlock-api.com, MIT-lizenziertes Projekt).
// Endpunkt: GET /v1/leaderboard/{region} mit region ∈ Europe|Asia|NAmerica|SAmerica|Oceania.
// Antwort: { entries: [{ account_name, possible_account_ids[], rank, top_hero_ids[] }] }
// (verifiziert am 2026-09-30 anhand des Quellcodes: api/src/routes/v1/leaderboard/types.rs)
//
// Kriterium „high-rank“: Platz ≤ topN der offiziellen Rangliste einer Region.
// Steam-Namen sind nicht eindeutig – ein Spieler wird nur angelegt, wenn genau eine account_id genannt ist.

import type { Adapter } from './types.ts';
import { upsertPlayer } from '../pipeline/store.ts';

interface Entry {
  account_name?: string | null;
  possible_account_ids?: number[];
  rank?: number | null;
  top_hero_ids?: number[];
}

export const REGIONS = ['Europe', 'Asia', 'NAmerica', 'SAmerica', 'Oceania'] as const;

export const deadlockApiLeaderboard: Adapter = {
  id: 'deadlock-api-leaderboard',
  description: 'Öffentliche Ranglisten (Top-Spieler je Region) über api.deadlock-api.com',
  terms: 'Community-API (MIT-Quellcode). Keine Schlüssel nötig; sparsam abfragen (1 Anfrage/Region/Lauf), Quelle nennen.',
  minIntervalMs: 2000,
  missingRequirement: () => null,
  async run(ctx) {
    const base = String(ctx.sourceConfig.baseUrl || 'https://api.deadlock-api.com');
    const topN = Number(ctx.sourceConfig.topN || 100);
    const regions = (ctx.sourceConfig.regions as string[] | undefined) || [...REGIONS];
    let created = 0;
    let known = 0;
    let ambiguous = 0;
    for (const region of regions) {
      if (!(REGIONS as readonly string[]).includes(region)) throw new Error(`Unbekannte Region ${region}`);
      const url = `${base}/v1/leaderboard/${region}`;
      const { data, result } = await ctx.fetcher.json<{ entries?: Entry[] }>(url, { minIntervalMs: this.minIntervalMs });
      if (!Array.isArray(data.entries)) throw new Error(`Unerwartetes Antwortformat von ${url} (entries fehlt)`);
      data.entries.slice(0, topN).forEach((e, idx) => {
        const ids = e.possible_account_ids || [];
        if (!e.account_name || ids.length !== 1) {
          ambiguous++;
          return;
        }
        const position = idx + 1;
        const r = upsertPlayer(ctx.db, {
          displayName: e.account_name,
          category: 'high-rank',
          categoryEvidence: `Platz ${position} der offiziellen Rangliste (${region}), abgerufen ${result.fetchedAt.slice(0, 10)} über deadlock-api.com`,
          identity: { platform: 'steam-account', handle: String(ids[0]), url: null, evidenceUrl: url, linkType: 'api-id' },
        });
        if (r.created) created++;
        else known++;
      });
    }
    return { summary: `${created} neue, ${known} bekannte Spieler; ${ambiguous} Einträge ohne eindeutige Account-ID übersprungen`, stats: { created, known, ambiguous } };
  },
};
