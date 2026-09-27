import assert from 'node:assert/strict';
import * as path from 'node:path';
import { after, before, test } from 'node:test';
import { Catalog } from '../src/gamedata/catalog';
import { MatchStore, DEFAULT_STORE_OPTIONS } from '../src/state/matchStore';
import { analyzeFrame } from '../src/vision/frame';
import { findAnchor, findPortraits, readHud, readTabColumn } from '../src/vision/hud';
import { type TextRecognizer, createTesseract, parseSouls, prepareSouls, prepareValue, readNumber } from '../src/vision/ocr';
import { makeRaster, scaleBilinear } from '../src/vision/raster';
import { loadRefs } from '../src/vision/refs';
import { ScreenTracker } from '../src/vision/tracker';
import { loadPng } from './png';

// Geprüft an echten Screenshots des Nutzers (Sandbox, Build 6701, 1920×1080). Die Fixtures enthalten
// nur die ausgewerteten HUD-Bereiche, der Rest ist geschwärzt.

const dataDir = path.join(__dirname, '..', 'data');
const fx = (n: string) => loadPng(path.join(__dirname, 'fixtures', 'hud', `${n}.png`));
const { refs } = loadRefs(path.join(dataDir, 'vision', 'refs.json'))!;
const cat = Catalog.load(dataDir);
const cost = (c: string) => cat.item(c)?.cost ?? 0;

const INFERNUS = ['upgrade_grit', 'upgrade_clip_size', 'upgrade_health_stealing_magic', 'upgrade_rapid_recharge', 'upgrade_endurance', 'upgrade_healbane', 'upgrade_soaring_spirit'];
const MINA = ['upgrade_magic_burst', 'upgrade_spirit_sap', 'upgrade_spellslinger_headshots', 'upgrade_spirit_burn', 'upgrade_quick_silver', 'upgrade_cooldown_reduction', 'upgrade_boundless_spirit', 'upgrade_siphon_bullets'];
const CASES = [
  { n: 'infernus-hud', hero: 'hero_inferno', items: INFERNUS, value: 10_400, tab: false },
  { n: 'infernus-tab', hero: 'hero_inferno', items: INFERNUS, value: 10_400, tab: true },
  { n: 'mina-hud', hero: 'hero_vampirebat', items: MINA, value: 29_600, tab: false },
  { n: 'mina-tab', hero: 'hero_vampirebat', items: MINA, value: 29_600, tab: true },
];
const sorted = (a: string[]) => [...a].sort();

let ocr: TextRecognizer;
before(async () => { ocr = await createTesseract(); });
after(async () => { await ocr.close(); });

test('Bild: Summe der Listenpreise der erwarteten Items entspricht dem angezeigten Itemwert', () => {
  assert.equal(INFERNUS.reduce((a, i) => a + cost(i), 0), 10_400);
  assert.equal(MINA.reduce((a, i) => a + cost(i), 0), 29_600);
});

for (const c of CASES) {
  test(`Bild ${c.n}: HUD-Slots, Hero, Souls und Itemwert`, async () => {
    const r = fx(c.n);
    const hud = readHud(r, refs);
    assert.ok(hud, 'HUD gefunden');
    assert.deepEqual(sorted(hud.slots.filter((s) => s.state === 'item').map((s) => s.item!)), sorted(c.items));
    assert.equal(hud.slots.filter((s) => s.state === 'unknown').length, 0);
    const ps = findPortraits(r, refs, hud.scale);
    assert.deepEqual(ps.map((p) => p.hero), [c.hero]);
    assert.equal((await readNumber(ocr, prepareSouls(r, hud.soulsRect))).value, 0);
    assert.equal((await readNumber(ocr, prepareValue(r, hud.valueRect))).value, c.value);
    const col = readTabColumn(r, ps[0]!, refs);
    if (c.tab) assert.deepEqual(sorted(col!.filter((s) => s.state === 'item').map((s) => s.item!)), sorted(c.items));
    else assert.equal(col, null, 'ohne Tab keine Item-Spalte');
  });
}

test('Bild: andere Auflösungen (720p bis 4K, skaliert) – gleiche Items und Werte', async () => {
  const src = fx('mina-hud');
  for (const [w, h] of [[1280, 720], [2560, 1440], [3840, 2160]] as const) {
    const r = scaleBilinear(src, { x: 0, y: 0, w: src.w, h: src.h }, w, h);
    const hud = readHud(r, refs)!;
    assert.ok(hud, `${w}×${h}: HUD`);
    assert.ok(Math.abs(hud.scale - h / 1080) < 0.01, `${w}×${h}: Skala ${hud.scale}`);
    assert.deepEqual(sorted(hud.slots.filter((s) => s.state === 'item').map((s) => s.item!)), sorted(MINA), `${w}×${h}: Items`);
    assert.deepEqual(findPortraits(r, refs, hud.scale).map((p) => p.hero), ['hero_vampirebat']);
    assert.equal((await readNumber(ocr, prepareValue(r, hud.valueRect))).value, 29_600, `${w}×${h}: Itemwert`);
  }
});

test('Bild: ohne HUD (schwarz, einfarbig) – nichts erkannt, nichts erfunden', () => {
  const black = makeRaster(1920, 1080);
  for (let i = 3; i < black.data.length; i += 4) black.data[i] = 255;
  assert.equal(findAnchor(black), null);
  assert.equal(readHud(black, refs), null);
  assert.deepEqual(findPortraits(black, refs, 1), []);
  const teal = makeRaster(1920, 1080);
  for (let i = 0; i < teal.data.length; i += 4) { teal.data[i] = 80; teal.data[i + 1] = 165; teal.data[i + 2] = 130; teal.data[i + 3] = 255; }
  assert.equal(readHud(teal, refs), null, 'Fläche in Soul-Farbe ist kein Soul-Kreis');
});

test('OCR: nur plausible Zahlenformate werden akzeptiert', () => {
  assert.equal(parseSouls('10,400'), 10400);
  assert.equal(parseSouls('850'), 850);
  assert.equal(parseSouls('1.250'), 1250);
  assert.equal(parseSouls('10,40'), null);
  assert.equal(parseSouls(''), null);
  assert.equal(parseSouls('9999999'), null);
});

test('Tracker: Bild → Snapshot mit Hero, gemessenem Budget und geprüftem Inventar', async () => {
  const t = new ScreenTracker({ costOf: cost });
  const f = await analyzeFrame(fx('mina-tab'), refs, ocr, { searchPortraits: true });
  const s = t.update(f, 1000)!;
  assert.equal(s.source, 'screen');
  const me = s.players.find((p) => p.isMe)!;
  assert.equal(me.heroClass, 'hero_vampirebat');
  assert.equal(me.spendableSouls, 0);
  assert.equal(me.itemsComplete, true);
  assert.deepEqual(sorted(me.items!), sorted(MINA));
  assert.equal(t.status.valueCheck, 'ok');
  assert.equal(t.status.myHeroBy, 'Tab-Abgleich', 'eigene Tab-Spalte = eigenes HUD-Inventar');
  // Engine/Store: Budget gilt als beobachtet (nicht berechnet)
  const store = new MatchStore({ ...DEFAULT_STORE_OPTIONS, componentsOf: (i) => cat.item(i)?.components ?? [] });
  store.apply(s);
  assert.equal(store.state.players.me!.spendableSouls.status, 'observed');
});

test('Tracker: Hero-Wechsel startet ein neues Match, Hero-Korrektur hat Vorrang', async () => {
  const t = new ScreenTracker({ costOf: cost });
  const a = t.update(await analyzeFrame(fx('mina-hud'), refs, ocr, { searchPortraits: true }), 1000)!;
  const b = t.update(await analyzeFrame(fx('infernus-hud'), refs, ocr, { searchPortraits: true }), 2000)!;
  assert.notEqual(a.matchId, b.matchId);
  assert.equal(b.players[0]!.heroClass, 'hero_inferno');
  t.setHeroOverride('hero_haze');
  const c = t.update(await analyzeFrame(fx('infernus-hud'), refs, ocr, { searchPortraits: true }), 3000)!;
  assert.equal(c.players[0]!.heroClass, 'hero_haze');
  assert.equal(t.status.myHeroBy, 'Einstellung');
});

test('Tracker: einzelner Souls-Ausreißer wird erst nach Bestätigung übernommen', async () => {
  const t = new ScreenTracker({ costOf: cost });
  const f = await analyzeFrame(fx('mina-hud'), refs, ocr, { searchPortraits: true });
  const withSouls = (v: number) => ({ ...f, hud: { ...f.hud!, souls: { value: v, text: String(v), confidence: 80 } } });
  assert.equal(t.update(withSouls(1200), 1000)!.players[0]!.spendableSouls, 1200);
  assert.equal(t.update(withSouls(91_200), 2000)!.players[0]!.spendableSouls, undefined, 'Sprung ohne Bestätigung → kein Budget');
  assert.equal(t.update(withSouls(1500), 3000)!.players[0]!.spendableSouls, 1500);
});

test('Store: unveränderte Bildschirmwerte bleiben frisch (Duplikat bestätigt Beobachtung)', async () => {
  const t = new ScreenTracker({ costOf: cost });
  const f = await analyzeFrame(fx('mina-hud'), refs, ocr, { searchPortraits: true });
  const store = new MatchStore({ ...DEFAULT_STORE_OPTIONS, componentsOf: () => [] });
  store.apply(t.update(f, 1000)!);
  const second = t.update(f, 9000)!;
  store.apply(second);
  store.apply(t.update(f, 17_000)!);
  const v = store.view(20_000);
  assert.equal(v.players.me!.spendableSouls.status, 'observed', 'nach 19 s mit identischem Wert weiterhin beobachtet');
  assert.equal(store.view(40_000).players.me!.spendableSouls.status, 'stale', 'ohne neue Bilder veraltet');
});
