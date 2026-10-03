// Entwicklungs-Datensatz: ausdrücklich FIKTIVE Einträge, getrennt markiert (is_demo = 1).
// Wird nur mit CITADEL_DEMO=1 und ?demo=1 ausgeliefert und nie mit echten Daten vermischt.

import type { Db } from './db.ts';
import { recordObservation, upsertPlayer } from './pipeline/store.ts';

export function seedDemo(db: Db) {
  const players = [
    { name: 'DEMO Aurora (fiktiv)', sens: '1.1', dpi: '800', ch: { citadel_crosshair_color_r: '0', citadel_crosshair_color_g: '255', citadel_crosshair_color_b: '255', citadel_crosshair_pip_gap: '3' } },
    { name: 'DEMO Basalt (fiktiv)', sens: '2.2', dpi: '400', ch: null },
  ];
  for (const p of players) {
    const { playerId } = upsertPlayer(db, {
      displayName: p.name,
      category: 'unbekannt',
      categoryEvidence: 'Fiktiver Demo-Eintrag',
      identity: { platform: 'demo', handle: p.name, url: null, evidenceUrl: 'https://example.invalid/demo', linkType: 'self-declared' },
      isDemo: true,
    });
    const base = {
      playerId,
      sourceId: 'demo',
      sourceUrl: 'https://example.invalid/demo',
      sourceType: 'manual' as const,
      origin: 'manual-confirmed' as const,
      retrievedAt: new Date().toISOString(),
      extractorVersion: 'demo',
      contentHash: 'demo',
      gameConfirmed: true,
      evidence: 'Fiktiver Demo-Wert',
      publishedAt: null,
    };
    recordObservation(db, { ...base, field: 'sensitivity', value: p.sens });
    recordObservation(db, { ...base, field: 'dpi', value: p.dpi });
    if (p.ch) recordObservation(db, { ...base, field: 'crosshair', value: JSON.stringify(p.ch) });
  }
}
