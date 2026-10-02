// Bausteine der Engine: Kampfmathematik, Rezeptgraph, Budget, Fixierung, Erklärungen.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCost } from '../src/engine/candidates';
import { effectiveResist, resistMultiplier } from '../src/engine/combat';
import { optionReasons } from '../src/engine/explain';
import { Advisor } from '../src/engine/advisor';
import { DEFAULT_SETTINGS } from '../src/shared/types';
import { ITEM, data, inputFor, loadScenario, run, variant } from './helpers';

describe('Kampfmathematik (Regeln laut data/rules/combat-rules.json)', () => {
  it('Reihenfolge: Reduktion vor Durchdringung; Durchdringung nicht unter 0', () => {
    assert.equal(effectiveResist(100, { flatReduction: 0, pctReduction: 0, pctPen: 0.35, flatPen: 18 }), 100 * 0.65 - 18);
    assert.equal(effectiveResist(20, { flatReduction: 0, pctReduction: 0, pctPen: 0.4, flatPen: 30 }), 0);
    assert.ok(effectiveResist(10, { flatReduction: 20, pctReduction: 0, pctPen: 0, flatPen: 0 }) < 0, 'Reduktion kann negativ werden');
    assert.ok(resistMultiplier(-10) > 1);
  });
});

describe('Rezeptgraph und Restkosten', () => {
  it('vorhandene Komponenten werden angerechnet und verbraucht', () => {
    const r = resolveCost(ITEM.LDR, [ITEM.LAST_WHISPER, ITEM.CLOAK, 1036], data.patch.items);
    assert.equal(r.remaining, 3100 - 1450 - 600);
    assert.deepEqual(r.consumed.sort(), [ITEM.LAST_WHISPER, ITEM.CLOAK].sort());
    const r2 = resolveCost(ITEM.LDR, [1036, 1036], data.patch.items);
    assert.equal(r2.remaining, 3100 - 700, 'zwei Langschwerter im Last Whisper');
  });
});

describe('Budget und Komponenten', () => {
  it('Komponentenvorschlag bleibt im Budget und passt ins Zielitem', () => {
    const r = run(variant(loadScenario('jinx-base'), { me: { gold: 1000 } }));
    const c = r.components!;
    assert.ok(c.spend <= 1000);
    if (c.mode === 'components') {
      for (const b of c.buy) assert.ok(resolveCost(r.bestId!, [b.itemId], data.patch.items).consumed.includes(b.itemId), `${b.name} gehört zum Rezept`);
    }
  });

  it('ohne bezahlbare Komponente wird Gold sparen begründet', () => {
    const r = run(variant(loadScenario('jinx-base'), { me: { gold: 120 } }));
    assert.equal(r.components!.mode, 'save');
    assert.match(r.components!.reason, /fehlen \d+ g/);
  });
});

describe('Fixiertes Item', () => {
  it('wird Favorit; Nachteil bleibt über die Rangfolge sichtbar', () => {
    const free = run(loadScenario('jinx-base'));
    const pinnedId = free.ranking.find((id) => id !== free.modelBestId && id !== ITEM.GA)!;
    const pinned = run(loadScenario('jinx-base'), { pinnedItem: pinnedId });
    assert.equal(pinned.bestId, pinnedId);
    assert.ok(pinned.options[0].itemId !== pinnedId, 'bestes ungebundenes Item bleibt an Rang 1 der Liste');
    assert.equal(pinned.preview[0], pinnedId, 'Vorschau rechnet unter der Vorgabe');
    const advisor = new Advisor(data, { ...DEFAULT_SETTINGS, pinnedItem: pinnedId });
    const out = advisor.update(inputFor(loadScenario('jinx-base'), { ...DEFAULT_SETTINGS, pinnedItem: pinnedId }));
    assert.equal(out.favoriteId, pinnedId);
  });
});

describe('Erklärungen stammen aus der Berechnung', () => {
  it('Durchdringungsgrund nennt Ziele mit beobachteten Rüstungsitems', () => {
    const r = run(variant(loadScenario('jinx-base'), { enemies: { Garen: { items: [3047, ITEM.THORNMAIL, ITEM.RANDUIN] } } }));
    const ldr = r.options.find((o) => o.itemId === ITEM.LDR)!;
    const text = optionReasons(r, ldr, 3).join(' ');
    assert.match(text, /Durchdringung/);
    assert.match(text, /Garen ~\d+ Rüstung \(\+\d+ aus Items\)/);
  });

  it('ohne bekannte Gegnerinventare werden keine Item-Behauptungen erzeugt', () => {
    const s = loadScenario('jinx-base');
    const unknown = variant(s, { enemies: Object.fromEntries(s.enemies.map((e) => [e.champion, { items: [] }])) });
    const r = run(unknown);
    for (const o of r.options.slice(0, 5)) {
      const text = optionReasons(r, o, 3).join(' ');
      assert.doesNotMatch(text, /aus Items/);
    }
  });

  it('jede Option trägt Konfidenz und dokumentierte Modelllücken', () => {
    const r = run(loadScenario('jinx-base'));
    for (const o of r.options) {
      assert.ok(o.confidence > 0 && o.confidence <= 1);
      if (o.coverage !== 'full') assert.ok(o.unmodeled.length > 0);
    }
    assert.ok(r.assumptions.some((a) => a.includes('Szenario')));
  });
});
