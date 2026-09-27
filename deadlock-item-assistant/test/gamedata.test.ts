import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseKV1Tokens, parseKV3 } from '../src/gamedata/kv3';
import { murmurHash2 } from '../src/gamedata/hash';
import { catalog } from './helpers';

const cat = catalog();

test('KV3-Parser: Objekte, Arrays, Präfixe, Kommentare, mehrzeilige Strings', () => {
  const kv = parseKV3(`<!-- kv3 encoding:text:version{x} -->
  {
    a = 1 // Kommentar
    b = "x"
    c = [ 1, 2, 3, ]
    d = resource_name:"file.vpcf"
    e = subclass:
    {
      _class = "y"
    }
    f = """zeile1
zeile2"""
    g = true
    h = -2.5
  }`);
  assert.deepEqual(kv, { a: 1, b: 'x', c: [1, 2, 3], d: 'file.vpcf', e: { _class: 'y' }, f: 'zeile1\nzeile2', g: true, h: -2.5 });
  assert.deepEqual(parseKV1Tokens('"lang" { "Tokens" { "k" "v \\"q\\"" } }'), { k: 'v "q"' });
});

test('Extrahierter Datensatz: Build, Preise und Invarianten', () => {
  assert.ok(cat.manifest.build > 0);
  assert.deepEqual(cat.manifest.itemPricePerTier.slice(1, 5), [800, 1600, 3200, 6400]);
  for (const it of cat.items.values()) {
    assert.equal(it.cost, cat.manifest.itemPricePerTier[it.tier], `${it.nameEn}: Preis passt zur Stufe`);
    for (const c of it.components) assert.ok(cat.items.has(c), `${it.nameEn}: Komponente ${c} existiert`);
    for (const c of it.components) assert.ok(cat.item(c)!.tier < it.tier, `${it.nameEn}: Komponente niedrigerer Stufe`);
  }
  assert.ok(cat.items.size > 100);
  assert.ok(cat.heroes.size >= 30);
  assert.equal(cat.heroById.get(25)?.nameEn, 'Warden');
});

test('Kuratierte Spezialeffekte passen zum aktuellen Build', () => {
  assert.deepEqual(cat.unverifiedMechanics, [], `unbestätigt: ${cat.unverifiedMechanics.join(', ')}`);
  assert.equal(cat.knowledgeBuildMismatch, false);
});

test('Mechanik-Ableitung: Beispiele aus den Spieldaten', () => {
  const byName = (n: string) => [...cat.items.values()].find((i) => i.nameEn === n)!.className;
  assert.ok(cat.effectStrength(byName('Toxic Bullets'), 'antiHeal') > 0.5);
  assert.equal(cat.effectStrength(byName('Cheat Death'), 'antiHeal'), 0, 'Selbst-Malus ist keine Heilungsreduktion');
  assert.ok(cat.effectStrength(byName('Indomitable'), 'ccCleanse') > 0.5);
  assert.ok(cat.effectStrength(byName('Bullet Resilience'), 'bulletResist') >= 1);
  assert.ok(cat.effectStrength(byName('Extra Spirit'), 'spiritPower') > 0);
  const unstoppable = cat.effects.get(byName('Unstoppable'))!.find((e) => e.kind === 'ccImmunity')!;
  assert.equal(unstoppable.usableWhileStunned, false);
});

test('Heldensignale aus Fähigkeiten: Kontrolle wird erkannt', () => {
  const sig = (n: string) => cat.heroSignals.get([...cat.heroes.values()].find((h) => h.nameEn === n)!.className)!;
  assert.ok(sig('Warden').ccTypes.some((c) => c.type === 'Immobilisierung'));
  assert.ok(sig('Haze').ccTypes.some((c) => c.type === 'Schlaf'));
  assert.ok(sig('Warden').ccStrength > 0.5);
});

test('MurmurHash2 ist deterministisch (Zuordnung zu Spiel-IDs selbst ist unbestätigt)', () => {
  assert.equal(murmurHash2('upgrade_clip_size'), murmurHash2('upgrade_clip_size'));
  assert.notEqual(murmurHash2('upgrade_clip_size'), murmurHash2('upgrade_rapid_rounds'));
  assert.equal(murmurHash2('', 0), 0);
  // IDs sind eindeutig
  const ids = new Set([...cat.items.values()].map((i) => i.id));
  assert.equal(ids.size, cat.items.size);
});
