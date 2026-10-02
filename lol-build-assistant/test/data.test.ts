// Datenadapter, Stabilisierung, Ausfälle und Patch-Handling.

import assert from 'node:assert/strict';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { Advisor } from '../src/engine/advisor';
import { evaluate } from '../src/engine/engine';
import { buildEngineInput } from '../src/engine/input';
import { GoldRateTracker, InventoryTracker } from '../src/data/inventoryTracker';
import { LiveClient } from '../src/data/liveClient';
import { championKeyOf, normalizeStats } from '../src/data/normalize';
import { LivePoller } from '../src/data/poller';
import { loadData } from '../src/patch/patchData';
import { buildViewModel } from '../src/present/viewModel';
import { simToMatchState } from '../src/sim/simulation';
import { DEFAULT_SETTINGS, type InventoryItem, type MatchState } from '../src/shared/types';
import { DATA_DIR, ITEM, data, inputFor, loadScenario, variant } from './helpers';

const inv = (...ids: number[]): InventoryItem[] => ids.map((itemId, slot) => ({ itemId, count: 1, slot }));

describe('Inventar-Stabilisierung', () => {
  it('leere Inventarliste ist kein Verkauf aller Items', () => {
    const t = new InventoryTracker(data.patch.items);
    t.update('p', inv(3006, 3031), 0, 600);
    const r = t.update('p', [], 2000, 602);
    assert.deepEqual(r.items.map((i) => i.itemId), [3006, 3031]);
    assert.equal(r.gap, true);
    const later = t.update('p', inv(3006, 3031), 4000, 604);
    assert.equal(later.gap, false);
    assert.ok(!t.events.some((e) => e.kind === 'cleared-confirmed'));
  });

  it('Upgrade (Komponenten verschwinden, fertiges Item erscheint) wird sofort übernommen', () => {
    const t = new InventoryTracker(data.patch.items);
    t.update('p', inv(ITEM.LAST_WHISPER, ITEM.CLOAK), 0, 600);
    const r = t.update('p', inv(ITEM.LDR), 2000, 602);
    assert.deepEqual(r.items.map((i) => i.itemId), [ITEM.LDR]);
    assert.equal(t.events.at(-1)!.kind, 'upgrade');
  });

  it('unerklärtes Verschwinden wird erst nach Bestätigungszeit als Entfernung gewertet', () => {
    const t = new InventoryTracker(data.patch.items, { removalConfirmMs: 8000, emptyConfirmMs: 30000 });
    t.update('p', inv(3006, ITEM.THORNMAIL), 0, 600);
    assert.deepEqual(t.update('p', inv(3006), 2000, 602).items.map((i) => i.itemId).sort(), [3006, ITEM.THORNMAIL].sort());
    assert.deepEqual(t.update('p', inv(3006), 6000, 606).items.map((i) => i.itemId).sort(), [3006, ITEM.THORNMAIL].sort());
    assert.deepEqual(t.update('p', inv(3006), 10500, 610).items.map((i) => i.itemId), [3006]);
    assert.ok(t.events.some((e) => e.kind === 'removed-confirmed'));
  });

  it('Goldrate ignoriert Kaufsprünge', () => {
    const g = new GoldRateTracker();
    for (let s = 0; s <= 30; s += 2) g.add(600 + s, 500 + s * 7 - (s >= 16 ? 1000 : 0));
    assert.ok(Math.abs(g.rate()! - 7) < 0.6);
  });
});

describe('Normalisierung der Live Client Data', () => {
  it('Championschlüssel aus rawChampionName (lokalisierungsunabhängig)', () => {
    assert.equal(championKeyOf({ rawChampionName: 'game_character_displayname_MonkeyKing', championName: 'Wukong' }), 'MonkeyKing');
    assert.equal(championKeyOf({ championName: "Kai'Sa" }), 'KaiSa');
  });
  it('Durchdringung als verbleibender Anteil; unplausible Werte werden nicht interpretiert', () => {
    assert.ok(Math.abs(normalizeStats({ armorPenetrationPercent: 0.65 })!.armorPenPct! - 0.35) < 1e-9);
    assert.equal(normalizeStats({ armorPenetrationPercent: 1 })!.armorPenPct, 0);
    assert.equal(normalizeStats({ armorPenetrationPercent: 35 })!.armorPenPct, undefined);
    assert.equal(normalizeStats({ critDamage: 175 })!.critDamageTotal, 1.75);
  });
});

function mockGame(port0 = 0) {
  let gameTime = 600;
  let enemyItems = [{ itemID: 3047, count: 1, slot: 0 }];
  const player = (name: string, champ: string, team: string, items: unknown[]) => ({
    championName: champ, rawChampionName: `game_character_displayname_${champ}`, riotId: name, summonerName: name,
    team, position: '', level: 11, items, scores: { kills: 0, deaths: 0, assists: 0, creepScore: 100 },
  });
  const server = http.createServer((req, res) => {
    const body = (() => {
      switch (req.url) {
        case '/liveclientdata/activeplayer': return { riotId: 'Ich#EUW', level: 11, currentGold: 1200, championStats: { attackDamage: 150, armor: 70, magicResist: 40, maxHealth: 1800, attackSpeed: 1.1, critChance: 0.25, critDamage: 215, armorPenetrationPercent: 1, magicPenetrationPercent: 1 }, abilities: { Q: { abilityLevel: 5 }, W: { abilityLevel: 3 }, E: { abilityLevel: 1 }, R: { abilityLevel: 2 } } };
        case '/liveclientdata/playerlist': return [
          player('Ich#EUW', 'Jinx', 'ORDER', [{ itemID: 3006, count: 1, slot: 0 }, { itemID: 3031, count: 1, slot: 1 }, { itemID: 3340, count: 1, slot: 6 }]),
          player('Gegner#EUW', 'Garen', 'CHAOS', enemyItems),
        ];
        case '/liveclientdata/gamestats': return { gameMode: 'CLASSIC', gameTime: (gameTime += 2), mapNumber: 11 };
        default: return null;
      }
    })();
    if (!body) { res.statusCode = 404; res.end(); return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  });
  return new Promise<{ server: http.Server; url: string; setEnemy: (i: typeof enemyItems) => void }>((resolve) => {
    server.listen(port0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, setEnemy: (i) => { enemyItems = i; } }));
  });
}

describe('Live-Adapter gegen lokalen Mock der Live Client Data API', () => {
  it('liefert normalisierten Zustand, erkennt Ausfall und behält letzten gültigen Stand', async () => {
    const mock = await mockGame();
    const client = new LiveClient({ baseUrl: mock.url });
    const poller = new LivePoller(client, data.patch.items, { intervalMs: 50, staleAfterMs: 100, endedAfterMs: 60000 });
    const states: MatchState[] = [];
    poller.on('state', (s) => states.push(s));
    const t0 = Date.now();
    await poller.poll(t0);
    assert.equal(states[0].feed.status, 'live');
    const me = states[0].players.find((p) => p.id === states[0].me.id)!;
    assert.equal(me.championKey, 'Jinx');
    assert.equal(states[0].me.stats!.critDamageTotal, 2.15);
    assert.equal(states[0].gameVersion, null, 'Live Client Data liefert keine Version – nicht erfunden');
    assert.ok(poller.schema.find((f) => f.field === 'playerlist[].items')!.present);
    // Datenlücke beim Gegner → letzter stabiler Stand bleibt
    mock.setEnemy([]);
    await poller.poll(t0 + 2000);
    const garen = states[1].players.find((p) => p.championKey === 'Garen')!;
    assert.deepEqual(garen.items.map((i) => i.itemId), [3047]);
    // Server weg → stale mit Alter, keine erfundenen Daten
    await new Promise<void>((r) => mock.server.close(() => r()));
    await poller.poll(t0 + 5000);
    const last = states.at(-1)!;
    assert.equal(last.feed.status, 'stale');
    assert.equal(last.feed.lastSuccessAt, t0 + 2000);
    assert.deepEqual(last.players.find((p) => p.championKey === 'Garen')!.items.map((i) => i.itemId), [3047]);
  });

  it('verweigert Nicht-localhost-Ziele', () => {
    assert.throws(() => new LiveClient({ baseUrl: 'https://example.com:2999' }));
  });
});

describe('Veraltete Daten und Sichtbarkeit gegnerischer Items', () => {
  it('bei veralteten Daten gibt es Warnungen und keinen Favoritenwechsel', () => {
    const base = loadScenario('syndra-base');
    const advisor = new Advisor(data, DEFAULT_SETTINGS);
    const now = 1_700_000_000_000;
    const fresh = simToMatchState(base, { step: -1, manual: [] }, now);
    const first = advisor.update(buildEngineInput({ ...fresh, mode: 'live', feed: { status: 'live', lastSuccessAt: now } }, { ...DEFAULT_SETTINGS, enemyItemPolicy: 'live-client' }, {}, data.status, now)!, now);
    // Massive MR-Käufe, aber Daten sind 30 s alt
    const mr = variant(base, { enemies: { Malphite: { items: [3111, 4401, 3065] }, Sejuani: { items: [3111, 3065, 4401] }, Kaisa: { items: [3006, 6672, 3091] }, Ahri: { items: [3020, 6655, 3102] } } });
    const staleState = simToMatchState(mr, { step: -1, manual: [] }, now);
    const stale: MatchState = { ...staleState, mode: 'live', feed: { status: 'stale', lastSuccessAt: now - 30000, error: 'Zeitüberschreitung' } };
    let out = first;
    for (let i = 0; i < 4; i++) out = advisor.update(buildEngineInput(stale, { ...DEFAULT_SETTINGS, enemyItemPolicy: 'live-client' }, {}, data.status, now)!, now);
    assert.equal(out.favoriteId, first.favoriteId);
    assert.ok(out.result.ok && out.result.warnings.some((w) => w.includes('alt')));
    const vm = buildViewModel(out, stale, data, DEFAULT_SETTINGS, { ddVersion: '16.19.1', now });
    assert.equal(vm.status.label, 'Veraltet');
    assert.match(vm.status.detail, /30 s/);
  });

  it('Standardrichtlinie "manuell": API-Gegnerinventare werden nicht automatisch genutzt', () => {
    const s = simToMatchState(loadScenario('jinx-base'), { step: -1, manual: [] });
    const live: MatchState = { ...s, mode: 'live', feed: { status: 'live', lastSuccessAt: Date.now() } };
    const input = buildEngineInput(live, DEFAULT_SETTINGS, {}, data.status)!;
    assert.ok(input.enemies.every((e) => !e.itemsKnown && e.items.length === 0));
    const manual = buildEngineInput(live, DEFAULT_SETTINGS, { Garen: { items: [3075], updatedAt: Date.now() } }, data.status)!;
    assert.deepEqual(manual.enemies.find((e) => e.championKey === 'Garen')!.items, [3075]);
    const r = evaluate(input, data, DEFAULT_SETTINGS);
    assert.ok(r.ok && r.warnings.some((w) => w.includes('Gegnerinventare unbekannt')));
  });
});

describe('Patchversionen und unbekannte Items', () => {
  it('unbekannte Spielversion wird sichtbar eingeschränkt, nicht still verwendet', () => {
    const d = loadData(DATA_DIR, '26.19.712.0');
    assert.equal(d.status.level, 'version-mismatch');
    assert.equal(d.status.restricted, true);
    const r = evaluate(inputFor(loadScenario('jinx-base'), DEFAULT_SETTINGS, -1, d), d, DEFAULT_SETTINGS);
    assert.ok(r.ok && r.warnings.some((w) => w.includes('26.19')));
  });

  it('strikter Modus blockiert Empfehlungen ohne geprüften Datensatz', () => {
    const d = loadData(DATA_DIR, '26.19');
    const s = { ...DEFAULT_SETTINGS, strictPatch: true };
    const r = evaluate(inputFor(loadScenario('jinx-base'), s, -1, d), d, s);
    assert.equal(r.ok, false);
  });

  it('unbekannte oder entfernte Items werden gemeldet und nicht mit erfundenen Werten belegt', () => {
    const s = variant(loadScenario('jinx-base'), { enemies: { Garen: { items: [3047, 999999] } } });
    const r = evaluate(inputFor(s), data, DEFAULT_SETTINGS);
    assert.ok(r.ok);
    const garen = r.enemies.find((e) => e.championKey === 'Garen')!;
    assert.deepEqual(garen.unknownItems, [999999]);
    assert.ok(garen.notes.some((n) => n.includes('unbekannte Items')));
    const base = evaluate(inputFor(variant(loadScenario('jinx-base'), { enemies: { Garen: { items: [3047] } } })), data, DEFAULT_SETTINGS);
    assert.ok(base.ok && Math.abs(base.enemies.find((e) => e.championKey === 'Garen')!.armor.value - garen.armor.value) < 1e-9);
  });

  it('kuratierter Datensatz ist konsistent (Rezepte, Kosten, dokumentierte Lücken)', () => {
    assert.deepEqual(data.problems, []);
  });
});
