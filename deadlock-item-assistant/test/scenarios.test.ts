import assert from 'node:assert/strict';
import { test } from 'node:test';
import { priceFor, rankCandidates, slotInfo } from '../src/engine/advisor';
import { assess } from '../src/engine/assess';
import { DEFAULT_WEIGHTS } from '../src/engine/weights';
import { Engine } from '../src/engine/engine';
import type { AdvisorOutput } from '../src/shared/types';
import { H, I, type Pl, catalog, snap } from './helpers';

// Szenarien aus dem Auftrag (Abschnitt 11). Alle Erwartungen folgen aus der
// allgemeinen Logik – es gibt keine Sonderfälle für einzelne Heroes im Code.

const cat = catalog();
const run = (s: Parameters<typeof snap>[0]) => new Engine(cat).ingest(snap(s)).output;
const rankOf = (o: AdvisorOutput, name: string) => o.ranking.findIndex((c) => c.item === I(name));
const scoreOf = (o: AdvisorOutput, name: string) => o.ranking.find((c) => c.item === I(name))?.score ?? -1;
const threat = (o: AdvisorOutput, hero: string) => o.threats.find((t) => t.heroClass === H(hero))!;
const shown = (o: AdvisorOutput) => [o.buyNow?.item, o.saveFor?.item].filter(Boolean) as string[];
const ccHeavy = (item: string) => {
  const need = cat.effectStrength(item, 'ccCleanse') + cat.effectStrength(item, 'ccImmunity') + cat.effectStrength(item, 'ccBarrier');
  return need > 0.3;
};

const HAZE_MID: Pl = { hero: 'Haze', items: ['Extended Magazine', 'Rapid Rounds', 'Headshot Booster', 'Extra Stamina'], nw: 9000, souls: 1700 };
const avgEnemies = (nw: number): Pl[] => [
  { hero: 'Infernus', nw, items: ['Extra Spirit', 'Mystic Burst', 'Extra Health'] },
  { hero: 'Seven', nw, items: ['Extra Spirit', 'Extended Magazine', 'Extra Regen'] },
  { hero: 'Wraith', nw, items: ['Rapid Rounds', 'Extended Magazine', 'Extra Stamina'] },
  { hero: 'Kelvin', nw, items: ['Extra Spirit', 'Extra Health'] },
  { hero: 'Abrams', nw, items: ['Extra Health', 'Melee Charge'] },
];

test('Warden im Gegnerteam, aber schwach: kein teurer CC-Counter nur wegen des Namens', () => {
  const o = run({ me: HAZE_MID, enemies: [{ hero: 'Warden', nw: 5500, k: 1, d: 6, items: ['Extra Health', 'Extended Magazine'] }, ...avgEnemies(9000)] });
  for (const i of shown(o)) {
    const it = cat.item(i)!;
    assert.ok(!(ccHeavy(i) && it.cost >= 3200), `teurer CC-Counter ${it.nameEn} empfohlen`);
  }
  assert.ok(threat(o, 'Warden').threat < threat(o, 'Infernus').threat);
});

test('Wardens Kontrolle wird zum Problem: CC-Schutz steigt deutlich in der Priorität', () => {
  const me: Pl = { hero: 'Haze', items: ['Titanic Magazine', 'Swift Striker', 'Headhunter', 'Kinetic Dash', 'Bullet Lifesteal', 'Hollow Point'], nw: 21000, souls: 3500 };
  const others = avgEnemies(19000);
  const weak = run({ me, t: 1800, enemies: [{ hero: 'Warden', nw: 12000, items: ['Extra Health', 'Extended Magazine'] }, ...others] });
  const strong = run({ me, t: 1800, problems: [{ enemyKey: 'e0', kind: 'cc' }], enemies: [
    { hero: 'Warden', nw: 27000, k: 9, d: 2, items: ['Titanic Magazine', 'Duration Extender', 'Superior Cooldown', 'Fortitude', 'Bullet Resilience', 'Extra Stamina'] }, ...others] });
  assert.ok(strong.needs.values.ccDefense > weak.needs.values.ccDefense + 0.25, 'CC-Bedarf steigt');
  for (const name of ['Indomitable', 'Unstoppable', 'Debuff Reducer']) {
    assert.ok(scoreOf(strong, name) > scoreOf(weak, name) * 1.3, `${name} gewinnt an Wert`);
    assert.ok(rankOf(strong, name) < rankOf(weak, name) || rankOf(weak, name) === -1, `${name} steigt im Ranking`);
  }
  // Die Hauptempfehlung trägt selbst zum CC-Schutz bei (z. B. Statusresistenz) – belegt über die Faktoren
  const main = strong.primary === 'save' ? strong.saveFor! : strong.buyNow!;
  const r = strong.ranking.find((c) => c.item === main.item)!;
  assert.ok(r.terms.find((t) => t.key === 'counter')!.value > 0.2, 'Hauptempfehlung hat nennenswerten Counter-Nutzen');
  assert.ok(threat(strong, 'Warden').threat > 0.8);
});

test('Infernus mit klarem Vorsprung wiegt schwerer, schwacher Gegner wird nicht ausgeblendet', () => {
  const o = run({ me: HAZE_MID, enemies: [
    { hero: 'Infernus', nw: 16000, k: 6, items: ['Improved Spirit', 'Spirit Lifesteal', 'Superior Duration', 'Mystic Burst'] },
    { hero: 'Warden', nw: 4000, k: 0, d: 7, items: ['Extra Health'] },
    ...avgEnemies(8500).slice(1)] });
  const inf = threat(o, 'Infernus'), war = threat(o, 'Warden');
  assert.equal(o.threats[0].heroClass, H('Infernus'));
  assert.ok(inf.threat > war.threat * 2);
  assert.ok(war.threat >= 0.05, 'schwacher Gegner behält eine Mindestrelevanz');
  assert.ok(o.needs.drivers.spiritDefense[0].enemyKey === inf.key, 'Spirit-Druck kommt vor allem von Infernus');
});

test('Wenige Kills, aber viele Souls und starke Items: Gefahr wird erkannt', () => {
  const o = run({ me: HAZE_MID, enemies: [
    { hero: 'Wraith', nw: 17000, k: 1, d: 3, a: 2, items: ['Titanic Magazine', 'Swift Striker', 'Hollow Point', 'Bullet Lifesteal'] },
    { hero: 'Seven', nw: 9000, k: 8, d: 2, items: ['Extra Spirit', 'Extended Magazine'] },
    ...avgEnemies(9000).filter((e) => e.hero !== 'Wraith' && e.hero !== 'Seven')] });
  assert.equal(o.threats[0].heroClass, H('Wraith'), 'Farm-Vorsprung schlägt KDA');
});

test('Zurückliegender Gegner mit entscheidendem CC bleibt als Ermöglicher relevant', () => {
  const o = run({ me: HAZE_MID, enemies: [
    { hero: 'Haze', key: 'e0', nw: 18000, items: ['Titanic Magazine', 'Swift Striker', 'Hollow Point', 'Headhunter'] },
    { hero: 'Lash', key: 'e1', nw: 5000, items: ['Extra Health'] },
    { hero: 'McGinnis', key: 'e2', nw: 5000, items: ['Extra Health'] },
  ] });
  const lash = threat(o, 'Lash'), mc = threat(o, 'McGinnis');
  assert.ok(lash.enabler > 0.3, 'Lash ermöglicht den Schaden des starken Mitspielers');
  assert.ok(lash.threat > mc.threat + 0.1, 'CC-Gegner wiegt schwerer als gleich schwacher Gegner ohne CC');
  assert.ok(o.needs.drivers.ccDefense[0].enemyKey === lash.key);
});

test('Bevorzugter Counter zu teuer: Zwischenlösung gegen Sparen abgewogen, nichts Unbezahlbares als bezahlbar', () => {
  const o = run({ me: { ...HAZE_MID, souls: 900 }, enemies: [
    { hero: 'Abrams', nw: 18000, k: 7, items: ['Bullet Lifesteal', 'Healing Booster', 'Fortitude', 'Healing Rite', 'Spirit Lifesteal'] },
    { hero: 'Lady Geist', nw: 15000, items: ['Spirit Lifesteal', 'Improved Spirit', 'Healing Booster'] },
    ...avgEnemies(8000).slice(1, 4)] });
  assert.ok(o.buyNow === null || o.buyNow.price! <= 900, 'Jetzt-kaufen ist bezahlbar');
  if (o.buyNow) assert.equal(o.buyNow.affordable, 'yes');
  assert.ok(o.saveFor, 'Sparziel vorhanden');
  assert.ok(o.saveFor!.missing! > 0, 'fehlender Betrag angegeben');
  assert.ok(o.primaryReason.length > 10);
  assert.ok(['buy', 'save'].includes(o.primary));
});

test('Gesamt-Souls bekannt, ausgebbares Budget unbekannt: nichts ist „sicher bezahlbar“', () => {
  const o = run({ me: HAZE_MID, noSouls: true, enemies: avgEnemies(9000) });
  assert.ok(o.buyNow);
  assert.equal(o.buyNow!.affordable, 'unknown');
  assert.equal(o.budget.status, 'unknown');
  assert.ok(o.warnings.some((w) => w.includes('unbekannt')));
  assert.equal(o.buyNow!.missing, null);
});

test('Erster vollständiger Inventar-Snapshot: keine Flut falscher Kaufmeldungen', () => {
  const e = new Engine(cat);
  const s = snap({ me: HAZE_MID, enemies: avgEnemies(9000) });
  const r = e.ingest(s);
  assert.equal(r.alerts.length, 0);
  const later = e.tick(s.receivedAt + 20_000);
  assert.equal(later.alerts.length, 0);
  assert.ok(e.store.state.events.every((x) => x.kind !== 'new-detected' && x.kind !== 'purchased'));
});

test('Gegner erhält ein entscheidendes neues Item: ein einzelner, gebündelter Hinweis', () => {
  const e = new Engine(cat);
  const base = { me: HAZE_MID, enemies: [{ hero: 'Infernus', nw: 15000, items: ['Improved Spirit', 'Mystic Burst', 'Extra Health'] }, ...avgEnemies(9000).slice(1)] };
  const t0 = 1_000_000;
  e.ingest(snap({ ...base, at: t0, t: 900 }));
  const withHeal = { ...base, enemies: [{ ...base.enemies[0], items: [...base.enemies[0].items!, 'Spirit Lifesteal', 'Healing Booster'] }, ...base.enemies.slice(1)] };
  let alerts = e.ingest(snap({ ...withHeal, at: t0 + 3000, t: 903 })).alerts;
  assert.equal(alerts.length, 0, 'wird zunächst gebündelt');
  alerts = e.ingest(snap({ ...withHeal, at: t0 + 9000, t: 909 })).alerts;
  assert.equal(alerts.length, 1, 'genau ein Hinweis');
  const a = alerts[0];
  assert.equal(a.heroName, 'Infernus');
  assert.deepEqual(new Set(a.items), new Set([I('Spirit Lifesteal'), I('Healing Booster')]));
  assert.equal(a.wording, 'gekauft', 'Demo-Quelle liefert Käufe; Spectator würde „neu erkannt“ melden');
  assert.match(a.consequence, /Heilungsreduktion/);
  // gleiche Items erneut → keine Doppelmeldung
  assert.equal(e.ingest(snap({ ...withHeal, at: t0 + 20000, t: 920 })).alerts.length, 0);
});

test('Spectator-Quelle: neue Items heißen „neu erkannt“, nicht „gekauft“', () => {
  const e = new Engine(cat);
  const base = { source: 'spectator' as const, me: HAZE_MID, enemies: [{ hero: 'Infernus', nw: 15000, items: ['Improved Spirit', 'Mystic Burst'] }, ...avgEnemies(9000).slice(1)] };
  e.ingest(snap({ ...base, at: 1000, t: 900 }));
  const add = { ...base, enemies: [{ ...base.enemies[0], items: [...base.enemies[0].items!, 'Spirit Lifesteal', 'Healing Booster'] }, ...base.enemies.slice(1)] };
  e.ingest(snap({ ...add, at: 2000, t: 901 }));
  const alerts = e.ingest(snap({ ...add, at: 9000, t: 908 })).alerts;
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].wording, 'neu erkannt');
});

test('Inventar voll: Austausch mit Netto-Kosten und verlorenem Nutzen', () => {
  const o = run({ me: { hero: 'Haze', items: ['Titanic Magazine', 'Swift Striker', 'Headhunter', 'Kinetic Dash', 'Bullet Lifesteal', 'Hollow Point', 'Extra Health', 'Sprint Boots', 'Extra Regen'], nw: 26000, souls: 6600 }, t: 2000, enemies: [
    { hero: 'Infernus', nw: 30000, items: ['Improved Spirit', 'Spirit Lifesteal', 'Healing Booster', 'Superior Duration', 'Boundless Spirit', 'Extra Health'] },
    { hero: 'Lady Geist', nw: 24000, items: ['Improved Spirit', 'Spirit Lifesteal', 'Extra Health'] }] });
  assert.equal(o.slots.used, 9);
  assert.ok(o.swap || o.swapNote, 'Austausch geprüft');
  if (o.swap) {
    const sold = cat.item(o.swap.sell)!;
    assert.equal(o.swap.refund, sold.cost / 2, 'Erstattung = halber Kaufpreis (laut Spieltext)');
    const price = priceFor(cat, o.swap.buy, []).price;
    assert.equal(o.swap.netCost, price - o.swap.refund);
    assert.ok(o.swap.loss.length > 0 && o.swap.gain.length > 0);
    assert.notEqual(sold.tier, 4, 'kein reflexhafter Verkauf eines Kern-Items');
  }
});

test('Upgrade verbraucht vorhandene Komponente: Differenzpreis, kein Slot, kein Verkaufserlös', () => {
  const owned = [I('Debuff Reducer'), I('Extended Magazine')];
  const p = priceFor(cat, I('Unstoppable'), owned);
  assert.equal(p.price, 6400 - 1600);
  assert.deepEqual(p.consumes, [I('Debuff Reducer')]);
  const e = new Engine(cat);
  const s = snap({ me: { hero: 'Haze', items: ['Debuff Reducer', 'Extended Magazine', 'Rapid Rounds', 'Headshot Booster', 'Extra Stamina', 'Extra Health', 'Sprint Boots', 'Extra Regen', 'Close Quarters'], nw: 20000, souls: 5000 }, t: 1600,
    problems: [{ enemyKey: 'e0', kind: 'cc' }], enemies: [{ hero: 'Warden', nw: 25000, items: ['Duration Extender', 'Superior Cooldown', 'Fortitude'] }, ...avgEnemies(17000)] });
  const o = e.ingest(s).output;
  const st = e.store.view(s.receivedAt);
  const a = assess(cat, st, DEFAULT_WEIGHTS, s.receivedAt);
  const u = rankCandidates(cat, a, DEFAULT_WEIGHTS, a.me.items, slotInfo(cat, st, a.me.items)).find((c) => c.item === I('Unstoppable'));
  assert.ok(u, 'Unstoppable bewertet');
  assert.equal(u!.price, 4800);
  assert.equal(u!.needsSlot, false, 'Upgrade braucht keinen neuen Slot');
  assert.ok(u!.terms.some((t) => t.key === 'consumed'), 'verbrauchte Komponente wird vom Nutzen abgezogen');
  if (o.swap) assert.notEqual(o.swap.sell, I('Debuff Reducer'), 'verbrauchte Komponente wird nicht zusätzlich verkauft');
});

test('Bereits gekaufte Absicherung: kein blindes Duplikat', () => {
  const enemies: Pl[] = [{ hero: 'Abrams', nw: 18000, k: 7, items: ['Bullet Lifesteal', 'Healing Booster', 'Fortitude', 'Spirit Lifesteal'] }, ...avgEnemies(9000).slice(1, 4)];
  const without = run({ me: { ...HAZE_MID, souls: 4000 }, enemies });
  const withAH = run({ me: { ...HAZE_MID, items: [...HAZE_MID.items!, 'Toxic Bullets'], souls: 4000 }, enemies });
  const antiHealItems = ['Healbane', 'Decay', 'Inhibitor', 'Crippling Headshot', 'Spirit Burn'];
  for (const n of antiHealItems) {
    const a = without.ranking.find((c) => c.item === I(n));
    const b = withAH.ranking.find((c) => c.item === I(n));
    if (a && b) {
      const ca = a.terms.find((t) => t.key === 'counter')?.value ?? 0;
      const cb = b.terms.find((t) => t.key === 'counter')?.value ?? 0;
      assert.ok(cb < ca, `${n}: Counter-Nutzen sinkt, wenn schon Heilungsreduktion vorhanden`);
    }
  }
  for (const i of shown(withAH)) assert.ok(cat.effectStrength(i, 'antiHeal') < 0.3 || i === I('Toxic Bullets'), 'kein zweiter reiner Anti-Heal-Kauf');
});

test('Persönliche Schadensdaten fehlen: Schadensprofil als Schätzung gekennzeichnet', () => {
  const o = run({ me: HAZE_MID, enemies: [{ hero: 'Infernus', nw: 15000, items: ['Improved Spirit', 'Mystic Burst', 'Superior Duration', 'Extra Spirit'] }, ...avgEnemies(9000).slice(1)] });
  for (const t of o.threats) assert.notEqual(t.damageMix.provenance, 'damage-window');
  assert.equal(threat(o, 'Infernus').damageMix.provenance, 'from-build');
  assert.ok(o.threats.every((t) => !t.factors.some((f) => f.label.includes('Schaden gegen dich'))));
});

test('Schadensfenster vorhanden: Quelle wird ausgewiesen und fokussiert', () => {
  const s = snap({ me: HAZE_MID, enemies: avgEnemies(9000) });
  s.damageToMe = { windowSec: 30, entries: [{ playerKey: 'e2', bullet: 900, spirit: 50, total: 950 }, { playerKey: 'e0', spirit: 100, total: 100 }] };
  const o = new Engine(cat).ingest(s).output;
  assert.equal(o.threats[0].key, 'e2');
  assert.equal(o.threats[0].damageMix.provenance, 'damage-window');
  assert.ok(o.needs.focus.includes('bulletDefense'));
});
