import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { Engine } from '../src/engine/engine';
import { AutoProvider } from '../src/providers/auto';
import { parseLoginUsers } from '../src/providers/discovery';
import { DEADLOCK_GAME_ID, GepAssembler, GepProvider } from '../src/providers/gep';
import type { ProviderSnapshot } from '../src/shared/types';
import { H, I, catalog } from './helpers';

// Simulierte Overwolf-GEP-Events nach dem dokumentierten Deadlock-Schema (match_info.roster_N / items_N).
// Ersetzt KEINEN Test mit echtem ow-electron und laufendem Spiel.

const cat = catalog();
const heroId = (name: string) => cat.heroes.get(H(name))!.heroId;
const roster = (i: number, o: Record<string, unknown>) => ['match_info', `roster_${i}`, JSON.stringify(o)] as const;
const items = (i: number, sid: string, names: string[]) => ['match_info', `items_${i}`, JSON.stringify({ steam_id: sid, items: names.map((n) => ({ class_name: I(n), name: n, id: 1 })) })] as const;

function baseMatch(a: GepAssembler, souls = 2000) {
  a.handle('match_info', 'match_id', '555');
  a.handle(...roster(0, { steam_id: '1', player_name: 'Ich', team_id: 2, is_local: true, hero_id: heroId('Haze'), souls, kills: 1 }));
  a.handle(...roster(1, { steam_id: '2', player_name: 'Gegner', team_id: 3, is_local: false, hero_id: heroId('Infernus'), souls: 9000 }));
  a.handle(...roster(2, { steam_id: '3', player_name: 'Mit', team_id: 2, is_local: false, hero_id: heroId('Abrams'), souls: 6000 }));
  a.handle(...items(0, '1', ['Extended Magazine']));
  a.handle(...items(1, '2', ['Extra Spirit', 'Spirit Lifesteal']));
}

test('GEP: eigener Spieler, Teams relativ zum eigenen Team, Heroes und Items', () => {
  const a = new GepAssembler(cat);
  baseMatch(a);
  const s = a.snapshot(1000)!;
  assert.equal(s.matchId, '555');
  const me = s.players.find((p) => p.isMe)!;
  assert.equal(me.heroClass, H('Haze'));
  assert.equal(me.team, 0);
  assert.deepEqual(me.items, [I('Extended Magazine')]);
  assert.equal(s.players.find((p) => p.key === 'sid2')!.team, 1);
  assert.equal(s.players.find((p) => p.key === 'sid3')!.team, 0);
  assert.equal(me.spendableSouls, undefined, 'Bedeutung von souls noch unbekannt → kein Budget');
});

test('GEP: „souls“ sinkt beim eigenen Kauf um den Preis → als ausgebbares Budget erkannt', () => {
  const a = new GepAssembler(cat);
  baseMatch(a, 2000);
  a.snapshot(1000);
  // Kauf Titanic Magazine (Upgrade von Extended Magazine, Differenz 800)
  a.handle(...roster(0, { steam_id: '1', player_name: 'Ich', team_id: 2, is_local: true, hero_id: heroId('Haze'), souls: 1200 }));
  a.handle(...items(0, '1', ['Titanic Magazine']));
  const s = a.snapshot(2000)!;
  assert.equal(a.semantics, 'spendable');
  assert.equal(s.players.find((p) => p.isMe)!.spendableSouls, 1200);
  const out = new Engine(cat).ingest(s).output;
  assert.equal(out.budget.status, 'observed');
  assert.equal(out.budget.value, 1200);
});

test('GEP: „souls“ sinkt beim Kauf nicht → als Gesamtwert erkannt, Budget wird berechnet', () => {
  const a = new GepAssembler(cat);
  baseMatch(a, 5000);
  a.snapshot(1000);
  a.handle(...roster(0, { steam_id: '1', player_name: 'Ich', team_id: 2, is_local: true, hero_id: heroId('Haze'), souls: 5100 }));
  a.handle(...items(0, '1', ['Extended Magazine', 'Rapid Rounds']));
  const s = a.snapshot(2000)!;
  assert.equal(a.semantics, 'networth');
  const me = s.players.find((p) => p.isMe)!;
  assert.equal(me.netWorth, 5100);
  const out = new Engine(cat).ingest(s).output;
  assert.equal(out.budget.status, 'derived');
  assert.equal(out.budget.value, 5100 - 800 - 800);
});

test('GEP: neue Match-ID setzt alles zurück; Schadensfenster wird zugeordnet', () => {
  const a = new GepAssembler(cat);
  baseMatch(a);
  a.handle('match_info', 'incoming_damage', JSON.stringify({ time_filter: 30, total_damage: 900, damages: [{ player_name: 'Gegner', damage: 800, spirit_damage: 700 }] }));
  let s = a.snapshot(1000)!;
  assert.equal(s.damageToMe!.entries[0].playerKey, 'sid2');
  assert.equal(s.damageToMe!.windowSec, 30);
  a.handle('match_info', 'match_id', '556');
  assert.equal(a.snapshot(2000), null, 'keine Übernahme von Spielern aus dem alten Match');
  a.handle(...roster(0, { steam_id: '1', is_local: true, team_id: 2, hero_id: heroId('Warden'), souls: 0 }));
  s = a.snapshot(3000)!;
  assert.equal(s.matchId, '556');
  assert.equal(s.players.length, 1);
});

test('GEP-Provider: Spiel erkannt → Features aktiviert → Snapshots; getInfo-Abgleich', async () => {
  const gep = new EventEmitter() as EventEmitter & { setRequiredFeatures: (g: number, f: unknown) => Promise<void>; getInfo: () => Promise<unknown> };
  let required: unknown = 'nie';
  gep.setRequiredFeatures = async (g, f) => { assert.equal(g, DEADLOCK_GAME_ID); required = f; };
  gep.getInfo = async () => ({ info: { match_info: { match_id: '777', roster_0: JSON.stringify({ steam_id: '9', is_local: true, team_id: 1, hero_id: heroId('Haze'), souls: 100 }) } } });
  const p = new GepProvider(cat, gep);
  const snaps: ProviderSnapshot[] = [];
  p.on('snapshot', (s) => snaps.push(s));
  p.start();
  let enabled = false;
  gep.emit('game-detected', { enable: () => { enabled = true; } }, DEADLOCK_GAME_ID, 'Deadlock');
  assert.ok(enabled);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(required, null, 'alle Features angefordert');
  gep.emit('new-info-update', {}, DEADLOCK_GAME_ID, { feature: 'match_info', category: 'match_info', key: 'match_id', value: '777' });
  gep.emit('new-info-update', {}, DEADLOCK_GAME_ID, { feature: 'match_info', category: 'match_info', key: 'roster_0', value: JSON.stringify({ steam_id: '9', is_local: true, team_id: 1, hero_id: heroId('Haze'), souls: 100 }) });
  await new Promise((r) => setTimeout(r, 400));
  p.ingestInfo(await gep.getInfo());
  await new Promise((r) => setTimeout(r, 400));
  p.stop();
  assert.ok(snaps.length >= 1);
  assert.equal(snaps[snaps.length - 1].matchId, '777');
  assert.equal(snaps[snaps.length - 1].players[0].heroClass, H('Haze'));
  assert.equal(p.diagnostics().state, 'idle');
});

test('Automatisch: mit GEP wird GEP genutzt; Steam-Konto aus loginusers.vdf erkannt', () => {
  const vdf = `"users" { "76561198000000001" { "AccountName" "a" "PersonaName" "Alt" "MostRecent" "0" "Timestamp" "100" }
    "76561198012345678" { "AccountName" "b" "PersonaName" "Colin" "MostRecent" "1" "Timestamp" "200" } }`;
  const acc = parseLoginUsers(vdf)[0];
  assert.equal(acc.personaName, 'Colin');
  assert.equal(acc.accountId, 52079950);
  const gep = new EventEmitter() as never as ConstructorParameters<typeof GepProvider>[1];
  (gep as unknown as { setRequiredFeatures: () => Promise<void>; getInfo: () => Promise<void> }).setRequiredFeatures = async () => undefined;
  (gep as unknown as { getInfo: () => Promise<void> }).getInfo = async () => undefined;
  const auto = new AutoProvider(cat, { gep, gepStatus: 'Overwolf aktiv', spectatorBaseUrl: 'http://127.0.0.1:1', accountOverride: 42 });
  auto.start();
  assert.equal(auto.mode, 'gep');
  assert.match(auto.diagnostics().notes.join(' '), /42/);
  auto.stop();
});
