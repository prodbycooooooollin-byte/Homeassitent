import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ddragonMajorFor, mergeChampionStats, mergeItems, type SyncReport } from '../scripts/patch-sync';
import type { ItemDef } from '../src/shared/types';

const curated: ItemDef[] = [
  { id: 1036, name: 'Long Sword', cost: 350, recipe: [], tier: 'basic', tags: ['ad'], stats: { ad: 10 }, coverage: 'full' },
  { id: 3035, name: 'Last Whisper', cost: 1450, recipe: [1036, 1036], tier: 'epic', tags: ['pen'], stats: { ad: 20, armorPenPct: 0.18 }, coverage: 'full' },
  { id: 9999, name: 'Removed Item', cost: 3000, recipe: [], tier: 'legendary', tags: ['ad'], stats: { ad: 50 }, coverage: 'full' },
];
const dd = {
  1036: { name: 'Long Sword', gold: { total: 350, purchasable: true }, maps: { 11: true }, stats: { FlatPhysicalDamageMod: 10 }, tags: [] },
  3035: { name: 'Last Whisper', from: ['1036', '1036'], gold: { total: 1500, purchasable: true }, maps: { 11: true }, stats: { FlatPhysicalDamageMod: 20 }, tags: [] },
  7777: { name: 'Brand New Item', from: ['1036'], gold: { total: 3100, purchasable: true }, maps: { 11: true }, stats: { FlatArmorMod: 60 }, tags: [], depth: 3 },
};

describe('Patch-Sync (offline mit Fixture)', () => {
  it('übernimmt Preise aus Data Dragon, entfernt Verschwundenes, markiert Neues als unkuratiert', () => {
    const report: SyncReport = { gameVersion: '26.19', ddragonVersion: 'x', priceChanges: [], recipeChanges: [], statChanges: [], removed: [], uncurated: [], manualReview: [] };
    const { items } = mergeItems(curated, dd as never, null, report);
    assert.equal(items.find((i) => i.id === 3035)!.cost, 1500);
    assert.ok(!items.some((i) => i.id === 9999));
    const fresh = items.find((i) => i.id === 7777)!;
    assert.deepEqual(fresh.tags, ['unkuratiert']);
    assert.equal(fresh.stats.armor, 60);
    assert.equal(fresh.coverage, 'stats-only');
    assert.ok(report.manualReview.some((m) => m.includes('armorPenPct')), 'Tooltip-Werte werden zur Prüfung gemeldet, nicht geraten');
    assert.equal(items.find((i) => i.id === 3035)!.stats.armorPenPct, 0.18, 'kuratierter Wert bleibt bis zur Prüfung');
  });

  it('Versionsabbildung und Championwerte', () => {
    assert.equal(ddragonMajorFor(26), 16);
    const s = mergeChampionStats({ Jinx: { stats: { hp: 630, hpperlevel: 105, armor: 26, armorperlevel: 4.7, spellblock: 30, spellblockperlevel: 1.3, attackdamage: 59, attackdamageperlevel: 3.15, attackspeed: 0.625, attackspeedperlevel: 1.4 } } });
    assert.ok(Math.abs(s.Jinx.asg! - 0.014) < 1e-9);
  });
});
