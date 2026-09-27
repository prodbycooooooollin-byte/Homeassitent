import assert from 'node:assert/strict';
import * as http from 'node:http';
import { test } from 'node:test';
import { Engine } from '../src/engine/engine';
import { DemoProvider } from '../src/providers/demo';
import { ManualProvider } from '../src/providers/manual';
import { SpectatorAssembler, SpectatorProvider, SseParser } from '../src/providers/spectator';
import type { ProviderSnapshot } from '../src/shared/types';
import { H, I, catalog } from './helpers';

// Hinweis: Diese Tests prüfen gegen das im Quellcode dokumentierte Event-Schema
// (live-events/src/demo_parser/entity_events.rs). Sie ersetzen KEINEN Test mit einem echten Match.

const cat = catalog();
const idOf = (name: string) => cat.item(I(name))!.id!;

test('SSE-Parser: benannte Events, mehrzeilige Daten, Kommentare, Chunk-Grenzen', () => {
  const got: [string, string][] = [];
  const p = new SseParser((n, d) => got.push([n, d]));
  p.push(': ping\nevent: player_controller_entity_updated\nda');
  p.push('ta: {"a":1}\n\nevent: end\ndata: x\n\n');
  assert.deepEqual(got, [['player_controller_entity_updated', '{"a":1}'], ['end', 'x']]);
});

test('Spectator-Assembler: Hero, Team, eigener Spieler, Items; net_worth wird nicht zum Budget', () => {
  const a = new SpectatorAssembler(cat, { matchId: '42', myAccountId: 111 });
  a.handle('game_rules_proxy_entity_created', { entity_type: 'game_rules_proxy', game_start_time: 50, game_time: 50 });
  a.handle('player_controller_entity_created', { entity_type: 'player_controller', entity_index: 1, steam_id: 111, team: 2, hero_id: 13, net_worth: 9000, kills: 2, upgrades: [idOf('Extended Magazine')], game_time: 350 });
  a.handle('player_controller_entity_created', { entity_type: 'player_controller', entity_index: 2, steam_id: 222, team: 3, hero_id: 25, net_worth: 12000, upgrades: [idOf('Extra Health'), 987654321], game_time: 350 });
  a.handle('team_entity_updated', { entity_type: 'team', team: 2, flex_unlocked: 1, game_time: 351 });
  const s = a.snapshot(1000)!;
  assert.equal(s.gameTime, 301);
  const me = s.players.find((p) => p.isMe)!;
  assert.equal(me.heroClass, H('Haze'));
  assert.equal(me.team, 0);
  assert.deepEqual(me.items, [I('Extended Magazine')]);
  assert.equal(me.spendableSouls, undefined, 'net_worth ist kein ausgebbares Budget');
  const w = s.players.find((p) => p.key === 'acc222')!;
  assert.equal(w.heroClass, H('Warden'));
  assert.equal(w.itemsComplete, false, 'unbekannte ID → Snapshot gilt als unvollständig');
  assert.deepEqual(w.unknownItemIds, [987654321]);
  assert.equal(s.extraSlotsByTeam![0], 1);
  const out = new Engine(cat).ingest(s).output;
  assert.equal(out.budget.status, 'unknown');
  assert.equal(out.buyNow?.affordable, 'unknown');
});

test('Spectator-Provider über HTTP/SSE (lokaler Mock-Server): verbinden, Snapshots, Ende', async () => {
  const lines = [
    'event: message\ndata: {"status":"connected"}\n\n',
    `event: player_controller_entity_created\ndata: ${JSON.stringify({ entity_type: 'player_controller', entity_index: 1, steam_id: 111, team: 2, hero_id: 13, net_worth: 5000, upgrades: [idOf('Rapid Rounds')], game_time: 100 })}\n\n`,
    `event: player_controller_entity_created\ndata: ${JSON.stringify({ entity_type: 'player_controller', entity_index: 2, steam_id: 222, team: 3, hero_id: 1, net_worth: 6000, upgrades: [idOf('Extra Spirit')], game_time: 100 })}\n\n`,
    'event: tick_end\ndata: {"game_time":100}\n\n',
  ];
  let requestedUrl = '';
  const server = http.createServer((req, res) => {
    requestedUrl = req.url ?? '';
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    let i = 0;
    const iv = setInterval(() => {
      if (i < lines.length) res.write(lines[i++]);
      else { res.write('event: end\ndata: {}\n\n'); clearInterval(iv); res.end(); }
    }, 20);
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const p = new SpectatorProvider(cat, { baseUrl: `http://127.0.0.1:${port}`, matchId: '777', myAccountId: 111, throttleMs: 0 });
  const snaps: ProviderSnapshot[] = [];
  p.on('snapshot', (s) => snaps.push(s));
  const ended = new Promise<void>((r) => p.on('status', (d) => { if (d.state === 'ended') r(); }));
  p.start();
  await ended;
  p.stop();
  server.close();
  assert.match(requestedUrl, /^\/v1\/matches\/777\/live\/demo\/events\?subscribed_entities=/);
  assert.ok(snaps.length >= 1);
  const last = snaps[snaps.length - 1];
  assert.equal(last.players.length, 2);
  assert.equal(last.players.find((x) => x.isMe)!.heroClass, H('Haze'));
  assert.equal(p.diagnostics().state, 'idle');
});

test('Spectator-Provider: nicht erreichbarer Dienst → Fehlerstatus mit Warteabstand, kein Absturz', async () => {
  const p = new SpectatorProvider(cat, { baseUrl: 'http://127.0.0.1:1', matchId: '1', myAccountId: null });
  const states: string[] = [];
  p.on('status', (d) => states.push(d.state));
  p.start();
  await new Promise((r) => setTimeout(r, 300));
  p.stop();
  assert.ok(states.includes('error'));
  assert.ok(p.diagnostics().errors.length >= 1);
});

test('Manuelle Eingabe: Souls veralten mit ihrem Eingabezeitpunkt', () => {
  const m = new ManualProvider();
  const snaps: ProviderSnapshot[] = [];
  m.on('snapshot', (s) => snaps.push(s));
  m.start();
  m.update({ myHero: H('Haze'), myItems: [I('Extended Magazine')], mySouls: 2000 });
  m.update({ enemies: [{ key: 'm0', heroClass: H('Infernus'), items: [I('Extra Spirit')], netWorth: null }] });
  const e = new Engine(cat);
  const last = snaps[snaps.length - 1];
  const fresh = e.ingest(last).output;
  assert.equal(fresh.budget.status, 'observed');
  const old = e.tick(last.receivedAt + 120_000).output;
  assert.equal(old.budget.status, 'stale');
  assert.notEqual(old.buyNow?.affordable, 'yes');
});

test('Demo-Provider: klar gekennzeichnet, Zeit läuft, Gegnerkäufe erscheinen, eigener Kauf verbraucht Komponente', () => {
  const d = new DemoProvider(cat, 'infernus-lead');
  const snaps: ProviderSnapshot[] = [];
  d.on('snapshot', (s) => snaps.push(s));
  assert.match(d.label, /DEMO/);
  for (let i = 0; i < 10; i++) d.step(5);
  const s = snaps[snaps.length - 1];
  assert.equal(s.gameTime, 530);
  assert.ok(s.players.find((p) => p.key === 'e1')!.items!.includes(I('Spirit Lifesteal')));
  assert.ok(d.buyMine(I('Titanic Magazine')));
  const me = snaps[snaps.length - 1].players.find((p) => p.isMe)!;
  assert.ok(me.items!.includes(I('Titanic Magazine')) && !me.items!.includes(I('Extended Magazine')));
});
