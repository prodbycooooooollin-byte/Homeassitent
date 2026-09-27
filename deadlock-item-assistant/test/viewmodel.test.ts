import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Engine } from '../src/engine/engine';
import { buildOverlayVM } from '../src/present/viewModel';
import { catalog, snap } from './helpers';

const cat = catalog();
const diag = (id: 'demo' | 'spectator') => ({ id, label: id, state: 'live' as const, detail: '', startedAt: 0, lastDataAt: 0, rawEvents: 0, snapshots: 1, intervalMsAvg: null, unknownItemIds: [], notes: [], errors: [] });

test('Overlay-Ansicht: Demo gekennzeichnet, Budget unbekannt sichtbar, keine erfundenen Prozentangaben', () => {
  const o = new Engine(cat).ingest(snap({ me: { hero: 'Haze', items: ['Extended Magazine'], nw: 6000 }, noSouls: true, enemies: [{ hero: 'Infernus', nw: 7000, items: ['Extra Spirit'] }] })).output;
  const vm = buildOverlayVM(cat, o, diag('demo'), [], Date.now(), 9000);
  assert.equal(vm.isDemo, true);
  assert.equal(vm.buy?.affordable, 'unknown');
  assert.equal(vm.buy?.label, 'NÄCHSTER KAUF');
  assert.match(vm.dataNotice ?? '', /Budget unbekannt/);
  const all = JSON.stringify(vm);
  assert.doesNotMatch(all, /Siegchance|länger überleben|Gewinnwahrscheinlichkeit/);
  assert.ok(vm.buy!.reason.length > 5 && !/Meta|starkes Item|passt gut/.test(vm.buy!.reason));
});

test('Overlay-Ansicht: Spectator-Quelle als verzögert benannt', () => {
  const o = new Engine(cat).ingest(snap({ source: 'spectator', me: { hero: 'Haze', items: [], nw: 6000 }, noSouls: true, enemies: [{ hero: 'Warden', nw: 5000, items: [] }] })).output;
  const vm = buildOverlayVM(cat, o, diag('spectator'), [], Date.now(), 9000);
  assert.match(vm.sourceLabel, /verzögert/);
  assert.equal(vm.isDemo, false);
});
