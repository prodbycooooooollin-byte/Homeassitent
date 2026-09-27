import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Engine } from '../src/engine/engine';
import { DEFAULT_STORE_OPTIONS, MatchStore } from '../src/state/matchStore';
import type { ProviderSnapshot } from '../src/shared/types';
import { I, catalog, snap } from './helpers';

const cat = catalog();
const store = () => new MatchStore({ ...DEFAULT_STORE_OPTIONS, componentsOf: (i) => cat.item(i)?.components ?? [] });
const inv = (s: MatchStore, key: string) => s.state.players[key].items.value;
const one = (items: string[] | undefined, extra: Partial<ProviderSnapshot> = {}, complete = true): ProviderSnapshot => ({
  source: 'spectator', matchId: 'm1', receivedAt: 1000, gameTime: 100,
  players: [{ key: 'e', team: 1, heroClass: 'hero_inferno', items: items?.map(I), itemsComplete: complete }, { key: 'me', isMe: true, team: 0, heroClass: 'hero_haze' }],
  ...extra,
});

test('Verspätetes Update mit älterer Spielzeit wird verworfen (kein Rücksprung)', () => {
  const s = store();
  s.apply(one(['Extra Spirit', 'Extra Health'], { gameTime: 200, receivedAt: 1000 }));
  const r = s.apply(one(['Extra Spirit'], { gameTime: 150, receivedAt: 2000 }));
  assert.equal(r.accepted, false);
  assert.equal(s.state.stats.rejectedOutOfOrder, 1);
  assert.deepEqual(new Set(inv(s, 'e')), new Set([I('Extra Spirit'), I('Extra Health')]));
});

test('Match-Wechsel: nichts aus dem vorherigen Match wird übernommen', () => {
  const s = store();
  s.apply(one(['Extra Spirit'], { matchId: 'A', gameTime: 1500 }));
  const r = s.apply({ source: 'spectator', matchId: 'B', receivedAt: 5000, gameTime: 30, players: [{ key: 'x', team: 1, heroClass: 'hero_warden', items: [] , itemsComplete: true}] });
  assert.equal(r.reset, true);
  assert.equal(r.accepted, true, 'kleinere Spielzeit im neuen Match ist gültig');
  assert.equal(s.state.players.e, undefined);
  assert.equal(s.state.myKey, null);
  assert.equal(s.state.stats.matchResets, 1);
});

test('Unvollständiger Snapshot: fehlende Items gelten nicht als verkauft', () => {
  const s = store();
  s.apply(one(['Extra Spirit', 'Extra Health']));
  const r = s.apply(one(['Extra Spirit'], { receivedAt: 2000, gameTime: 110 }, false));
  assert.ok(inv(s, 'e')!.includes(I('Extra Health')));
  assert.equal(r.events.length, 0);
});

test('Entfernen erst nach Bestätigung in mehreren vollständigen Snapshots', () => {
  const s = store();
  s.apply(one(['Extra Spirit', 'Extra Health']));
  s.apply(one(['Extra Spirit'], { receivedAt: 2000, gameTime: 110 }));
  assert.ok(inv(s, 'e')!.includes(I('Extra Health')), 'nach einem Snapshot noch vorhanden');
  const r = s.apply(one(['Extra Spirit'], { receivedAt: 3000, gameTime: 120 }));
  assert.ok(!inv(s, 'e')!.includes(I('Extra Health')));
  assert.equal(r.events[0].kind, 'no-longer-seen', 'als „nicht mehr gesehen“, nicht als „verkauft“');
});

test('Upgrade erkannt: Komponente geht im neuen Item auf', () => {
  const s = store();
  s.apply(one(['Extra Spirit']));
  const r = s.apply(one(['Improved Spirit'], { receivedAt: 2000, gameTime: 110 }));
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].kind, 'upgraded');
  assert.deepEqual(r.events[0].consumed, [I('Extra Spirit')]);
  assert.deepEqual(inv(s, 'e'), [I('Improved Spirit')]);
});

test('Duplikate werden erkannt; Unbekannt ist nicht null', () => {
  const s = store();
  s.apply(one(undefined));
  assert.equal(s.state.players.e.items.status, 'unknown');
  assert.equal(s.state.players.e.items.value, null);
  const r = s.apply(one(undefined));
  assert.equal(r.reason, 'Duplikat');
});

test('Veraltete Werte werden als veraltet markiert; Empfehlung nicht mehr „sicher bezahlbar“', () => {
  const e = new Engine(cat);
  const t0 = 1_000_000;
  const s = snap({ me: { hero: 'Haze', items: ['Extended Magazine'], nw: 5000, souls: 5000 }, enemies: [{ hero: 'Warden', nw: 5000, items: [] }], at: t0 });
  const fresh = e.ingest(s).output;
  assert.equal(fresh.buyNow!.affordable, 'yes');
  const later = e.tick(t0 + 60_000).output;
  assert.equal(later.status, 'stale');
  assert.notEqual(later.buyNow?.affordable, 'yes');
  assert.ok(later.warnings[0].includes('veraltet'));
});

test('Stabilisierung: kleine Schwankungen ändern die sichtbare Empfehlung nicht, ein Kauf ersetzt sie sofort', () => {
  const e = new Engine(cat);
  const t0 = 1_000_000;
  const mk = (at: number, items: string[], souls: number, nw = 9000) => snap({ me: { hero: 'Haze', items, nw, souls }, enemies: [{ hero: 'Infernus', nw: 9000, items: ['Extra Spirit'] }, { hero: 'Wraith', nw: 9000, items: ['Rapid Rounds'] }], at, t: 900 + (at - t0) / 1000 });
  const first = e.ingest(mk(t0, ['Extended Magazine', 'Rapid Rounds'], 3300)).output;
  const shown = first.buyNow!.item!;
  const jitter = e.ingest(mk(t0 + 1000, ['Extended Magazine', 'Rapid Rounds'], 3350, 9050)).output;
  assert.equal(jitter.buyNow!.item, shown, 'bleibt stabil');
  const bought = e.ingest(mk(t0 + 2000, ['Extended Magazine', 'Rapid Rounds', cat.item(shown)!.nameEn].filter((x, i, a) => a.indexOf(x) === i), 3300 - first.buyNow!.price!)).output;
  assert.notEqual(bought.buyNow?.item, shown, 'gekauftes Item wird sofort ersetzt');
});
