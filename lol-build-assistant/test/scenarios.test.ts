// Fachliche Szenario-Tests (Abschnitt 10 der Anforderungen).
// Die Erwartungen sind qualitative, fachlich begründete Aussagen (Rangfolgen,
// Richtungen, Ausschlüsse, Stabilität) – keine Nachrechnung der Scoreformeln.
// Fachliche Validierung durch erfahrene Spieler steht aus (siehe docs/STATUS.md).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveSim } from '../src/sim/simulation';
import { ITEM, PHYS_PEN, data, driver, loadScenario, playTimeline, rank, run, score, variant } from './helpers';

const ARMOR_STACK = {
  Garen: { items: [3047, ITEM.THORNMAIL, ITEM.RANDUIN] },
  Viego: { items: [3047, 3153, 6333] },
  Nautilus: { items: [3047, ITEM.THORNMAIL] },
};

describe('Physischer Carry gegen zunehmende Rüstung', () => {
  const base = loadScenario('jinx-base');
  const armored = variant(base, { enemies: ARMOR_STACK });

  it('Durchdringung wird unter sonst gleichen Annahmen attraktiver', () => {
    const a = run(base); const b = run(armored);
    const ratio = (r: typeof a) => score(r, ITEM.LDR) / score(r, ITEM.SHIELDBOW);
    // Relative Gewinne anderer Items bleiben bei mehr Rüstung konstant (alle Schadensquellen
    // sinken gleichmäßig); nur Durchdringung gewinnt relativ – daher moderate Schwelle.
    assert.ok(ratio(b) > ratio(a) * 1.03, `LDR/Shieldbow ${ratio(a).toFixed(3)} → ${ratio(b).toFixed(3)}`);
    assert.ok(driver(b, ITEM.LDR, 'pen') > driver(a, ITEM.LDR, 'pen'), 'Pen-Beitrag steigt');
    assert.ok(rank(b, ITEM.LDR) <= rank(a, ITEM.LDR));
  });

  it('bei starker Rüstung auf relevanten Zielen liegt eine Durchdringungsoption vorne', () => {
    const b = run(armored);
    assert.ok(PHYS_PEN(b.bestId!), `Favorit ${b.bestId} ist keine Durchdringung`);
  });

  it('ein Kaufwechsel braucht einen nachvollziehbaren Vorteil (Hysterese)', () => {
    const s = { ...base, timeline: [
      { t: 960, label: 'Garen kauft Tuchrüstung', changes: [{ who: 'Garen', add: [ITEM.CLOTH] }] },
    ] };
    const { favorites, history } = playTimeline(s);
    assert.equal(favorites[0], favorites[1], 'kleine Rüstung löst keinen Wechsel aus');
    assert.ok(!history.some((h) => h.kind === 'switch'));
  });
});

describe('Magischer Champion gegen dieselben Rüstungskäufe', () => {
  const base = loadScenario('syndra-base');
  const armored = variant(base, { enemies: {
    Malphite: { items: [3047, ITEM.THORNMAIL, ITEM.RANDUIN] },
    Sejuani: { items: [3047, ITEM.DMP, ITEM.FROZEN] },
    Nautilus: { items: [3047, ITEM.THORNMAIL] },
  } });

  it('keine physische Durchdringung allein wegen der Rüstung', () => {
    const r = run(armored);
    assert.ok(!r.options.some((o) => PHYS_PEN(o.itemId)), 'Kein Lethalitäts-/Rüstungsdurchdringungs-Kandidat');
    assert.ok(!PHYS_PEN(r.bestId!));
  });

  it('erklärt, warum Rüstungsdurchdringung nicht vorgeschlagen wird', () => {
    const r = run(armored);
    const armorCheck = r.counters.find((c) => c.category === 'armor' && c.status === 'not-in-pool');
    assert.ok(armorCheck, 'Gegenmaßnahmen-Prüfung für Rüstung vorhanden');
    assert.match(armorCheck!.reason, /magisch|physisch/);
    assert.ok(r.myDamageMix.magic > 0.8);
  });

  it('der Favorit ändert sich durch reine Rüstungskäufe nicht in Richtung Durchdringung', () => {
    const a = run(base); const b = run(armored);
    const penShare = (r: typeof a) => score(r, ITEM.VOID) / score(r, ITEM.SHADOWFLAME);
    assert.ok(Math.abs(penShare(b) - penShare(a)) < 0.05, 'Magiedurchdringung bleibt unberührt von Rüstung');
  });
});

describe('Relevante Ziele kaufen Magieresistenz', () => {
  const base = loadScenario('syndra-base');
  const mr = variant(base, { enemies: {
    Malphite: { items: [3111, ITEM.FON] }, Sejuani: { items: [3111, ITEM.SV] },
    Kaisa: { items: [3006, 6672, ITEM.WITS] }, Ahri: { items: [3020, 6655, ITEM.BANSHEE] },
  } });

  it('magische Durchdringung wird neu und höher bewertet', () => {
    const a = run(base); const b = run(mr);
    const ratio = (r: typeof a) => score(r, ITEM.VOID) / score(r, ITEM.RABADON);
    assert.ok(ratio(b) > ratio(a) * 1.08, `Void/Rabadon ${ratio(a).toFixed(3)} → ${ratio(b).toFixed(3)}`);
    assert.ok(driver(b, ITEM.VOID, 'pen') > driver(a, ITEM.VOID, 'pen'));
  });

  it('beim physischen Carry lösen MR-Käufe keine Durchdringungsbewertung aus', () => {
    const jb = loadScenario('jinx-base');
    const a = run(jb);
    const b = run(variant(jb, { enemies: { Garen: { items: [3047, 1011, ITEM.FON] }, Viego: { items: [3047, 3153, ITEM.WITS] } } }));
    const pa = driver(a, ITEM.LDR, 'pen'); const pb = driver(b, ITEM.LDR, 'pen');
    assert.ok(pb <= pa * 1.02, `Pen-Beitrag darf durch MR nicht steigen (${pa.toFixed(3)} → ${pb.toFixed(3)})`);
  });
});

describe('Hohe Lebenswerte bei moderaten Resistenzen', () => {
  const base = loadScenario('jinx-base');
  const hpStack = variant(base, { enemies: {
    Garen: { items: [3047, ITEM.WARMOG, 1011] }, Viego: { items: [3047, 3153, ITEM.WARMOG] }, Nautilus: { items: [3047, 1011, 1011] },
  } });
  const armorStack = variant(base, { enemies: ARMOR_STACK });

  it('Prozent-Leben-Schaden gewinnt gegenüber Durchdringung stärker als bei Rüstungs-Stacking', () => {
    const h = run(hpStack); const a = run(armorStack);
    const ratio = (r: typeof h) => score(r, ITEM.BORK) / score(r, ITEM.LDR);
    assert.ok(ratio(h) > ratio(a) * 1.1, `BotRK/LDR HP ${ratio(h).toFixed(3)} vs. Rüstung ${ratio(a).toFixed(3)}`);
    assert.ok(driver(h, ITEM.BORK, 'hpPct') > 0);
  });
});

describe('Fast fertiges Kernitem und neuer Gegenbedarf', () => {
  // Jinx hält Last Whisper + Cloak (LDR fehlen 1050 g). Mortal Reminder nutzt Last Whisper ebenfalls.
  const held = { items: [3006, ITEM.IE, ITEM.KRAKEN, ITEM.LAST_WHISPER, ITEM.CLOAK], gold: 700, level: 12 };
  const calm = variant(loadScenario('jinx-base'), { me: held });
  const healers = variant(loadScenario('jinx-healers'), { me: held });

  it('Komponenten und Timing werden eingerechnet', () => {
    const r = run(healers);
    const ldr = r.options.find((o) => o.itemId === ITEM.LDR)!;
    const mortal = r.options.find((o) => o.itemId === ITEM.MORTAL)!;
    assert.equal(ldr.remaining, 1050, 'LDR: Last Whisper + Cloak werden angerechnet');
    assert.equal(mortal.remaining, 1750, 'Mortal Reminder: nur Last Whisper wird angerechnet');
    assert.ok(ldr.etaSec < mortal.etaSec);
  });

  it('ohne Gegenbedarf wird das fast fertige Kernitem abgeschlossen', () => {
    assert.equal(run(calm).bestId, ITEM.LDR);
  });

  it('mit starker gegnerischer Heilung wird Antiheal als Weg oder vorläufige Komponente sichtbar', () => {
    const r = run(healers);
    const visible = r.bestId === ITEM.MORTAL || r.alternatives.some((a) => a.itemId === ITEM.MORTAL)
      || r.interimCounters.some((c) => c.itemId === ITEM.EXEC);
    assert.ok(visible, `Favorit ${r.bestId}, Alternativen ${r.alternatives.map((a) => a.itemId)}, Interim ${r.interimCounters.map((c) => c.itemId)}`);
    const a = run(calm); const b = r;
    assert.ok(score(b, ITEM.MORTAL) / score(b, ITEM.LDR) > score(a, ITEM.MORTAL) / score(a, ITEM.LDR), 'Heilung verschiebt zugunsten Antiheal');
  });

  it('ohne vorhandene Komponenten ist Antiheal gegen starke Heiler konkurrenzfähig', () => {
    const r = run(variant(loadScenario('jinx-healers'), { me: { items: [3006, 6672], gold: 1500 } }));
    assert.ok(rank(r, ITEM.MORTAL) <= 3, `Mortal Reminder Rang ${rank(r, ITEM.MORTAL)}`);
    assert.ok(driver(r, ITEM.MORTAL, 'antiheal') > 0);
  });
});

describe('Bereits ausreichend vorhandene Durchdringung', () => {
  it('Kaufbeschränkungen: kein zweites Last-Whisper-Item', () => {
    const r = run(variant(loadScenario('jinx-base'), { me: { items: [3006, ITEM.IE, ITEM.LDR] }, enemies: ARMOR_STACK }));
    for (const id of [ITEM.MORTAL, ITEM.SERYLDA]) {
      assert.ok(!r.options.some((o) => o.itemId === id));
    }
    assert.match(r.exclusions.find((x) => x.itemId === ITEM.MORTAL)!.reason, /Kaufbeschränkung/);
  });

  it('abnehmender Zusatznutzen: Durchdringung gegen niedrige Rüstung bringt wenig', () => {
    const squishy = run(loadScenario('jinx-squishy'));
    const armored = run(variant(loadScenario('jinx-base'), { enemies: ARMOR_STACK }));
    assert.ok(driver(squishy, ITEM.LDR, 'pen') < driver(armored, ITEM.LDR, 'pen') * 0.85,
      `Pen-Beitrag squishy ${driver(squishy, ITEM.LDR, 'pen').toFixed(3)} vs. gepanzert ${driver(armored, ITEM.LDR, 'pen').toFixed(3)}`);
  });

  it('Magiedurchdringung: nach Void Staff ist Cryptbloom gesperrt', () => {
    const r = run(variant(loadScenario('syndra-base'), { me: { items: [3020, 6655, ITEM.VOID] } }));
    assert.ok(!r.options.some((o) => o.itemId === ITEM.CRYPT));
    assert.match(r.exclusions.find((x) => x.itemId === ITEM.CRYPT)!.reason, /Kaufbeschränkung/);
  });
});

describe('Gegnerische Heilung, eigenes Team besitzt Antiheal', () => {
  const healers = loadScenario('jinx-healers');
  const noTeamGw = run(healers);
  const reliable = run(variant(healers, { allies: { Orianna: { items: [3020, 6655, ITEM.MORELLO] } } }));
  const unreliable = run(variant(healers, { allies: { Malphite: { items: [3047, ITEM.THORNMAIL] } } }));

  it('zuverlässiges Team-Antiheal senkt den eigenen Antiheal-Wert, schließt ihn aber nicht aus', () => {
    const a = driver(noTeamGw, ITEM.MORTAL, 'antiheal');
    const b = driver(reliable, ITEM.MORTAL, 'antiheal');
    assert.ok(b < a * 0.7, `Antiheal-Beitrag ${a.toFixed(4)} → ${b.toFixed(4)}`);
    assert.ok(reliable.options.some((o) => o.itemId === ITEM.MORTAL), 'Mortal Reminder bleibt Kandidat');
  });

  it('unzuverlässig anwendbares Team-Antiheal (Thornmail beim Tank) zählt weniger', () => {
    const b = driver(reliable, ITEM.MORTAL, 'antiheal');
    const c = driver(unreliable, ITEM.MORTAL, 'antiheal');
    assert.ok(c > b, `Thornmail-Abdeckung ${c.toFixed(4)} > Morello-Abdeckung ${b.toFixed(4)}`);
  });
});

describe('Einzelner stark gerüsteter Gegner ist kein relevantes Ziel', () => {
  const base = loadScenario('zed-backline');
  it('kein pauschaler Umbau, Durchdringung verschiebt sich kaum', () => {
    const settings = { targetFocus: 'backline' as const };
    const a = run(base, settings);
    const b = run(variant(base, { enemies: { Ornn: { items: [3047, 3068, ITEM.THORNMAIL, ITEM.RANDUIN] } } }), settings);
    assert.equal(b.bestId, a.bestId, 'Favorit bleibt gleich');
    const ornn = b.enemies.find((e) => e.championKey === 'Ornn')!;
    assert.ok(ornn.targetWeight < 0.12, `Ornn-Zielgewicht ${ornn.targetWeight.toFixed(2)}`);
    const s = (r: typeof a) => score(r, ITEM.SERYLDA) / score(r, a.bestId!);
    assert.ok(s(b) - s(a) < 0.05, 'Serylda gewinnt kaum an Wert');
  });
});

describe('Hohe Bedrohung durch einen anderen Gegner', () => {
  const base = loadScenario('jinx-base');
  const fedAssassin = variant(base, { enemies: { Ahri: { items: [3020, 6655, ITEM.SHADOWFLAME, ITEM.RABADON], level: 14, kills: 9, deaths: 1 } } });

  it('Bedrohung und Zielgewichtung werden getrennt berücksichtigt', () => {
    const a = run(base); const b = run(fedAssassin);
    const ahriA = a.enemies.find((e) => e.championKey === 'Ahri')!;
    const ahriB = b.enemies.find((e) => e.championKey === 'Ahri')!;
    assert.ok(ahriB.threat > ahriA.threat * 1.3, 'Bedrohung steigt deutlich');
    assert.ok(b.weights.defense > a.weights.defense, 'Defensivgewicht steigt');
    assert.ok(Math.abs(ahriB.targetWeight - ahriA.targetWeight) < 0.1, 'Zielgewicht wird nicht mit Bedrohung vermischt');
    assert.ok(b.threat.magic > a.threat.magic, 'Bedrohungsmischung wird magischer');
  });

  it('defensive Optionen gegen magischen Burst steigen im Rang', () => {
    const a = run(base); const b = run(fedAssassin);
    const defBest = (r: typeof a) => Math.min(...[ITEM.SHIELDBOW, ITEM.GA, 3139].map((id) => rank(r, id)).filter((x) => x >= 0));
    assert.ok(defBest(b) <= defBest(a));
    const ms = (r: typeof a) => score(r, 3139) / score(r, ITEM.LDR);
    assert.ok(ms(b) > ms(a), 'Mercurial (MR) wird relativ wertvoller');
  });
});

describe('Kaum veränderter Zustand', () => {
  it('keine wechselnden Favoriten oder Meldungen', () => {
    const base = loadScenario('jinx-base');
    const s = { ...base, timeline: [
      { t: 910, label: 'Gold +100', changes: [{ who: 'me', gold: 1300 }] },
      { t: 920, label: 'Gold +100', changes: [{ who: 'me', gold: 1400 }] },
      { t: 930, label: 'Gold +100', changes: [{ who: 'me', gold: 1500 }] },
    ] };
    const { favorites, history } = playTimeline(s);
    assert.equal(new Set(favorites).size, 1);
    assert.equal(history.length, 1, 'nur der erste Vorschlag wird protokolliert');
  });
});

function resolveEnemies(s: ReturnType<typeof loadScenario>) {
  return resolveSim(s, { step: (s.timeline?.length ?? 0) - 1, manual: [] }).enemies;
}

describe('Zeitliche Szenarien: gleiche Teams, unterschiedliche Kaufverläufe', () => {
  const base = loadScenario('jinx-base');
  const armorPath = { ...base, timeline: [
    { t: 960, label: 'Garen Thornmail', changes: [{ who: 'Garen', add: [ITEM.THORNMAIL] }] },
    { t: 1020, label: 'Viego Death\'s Dance', changes: [{ who: 'Viego', add: [6333] }] },
    { t: 1080, label: 'Nautilus Frozen Heart', changes: [{ who: 'Nautilus', add: [ITEM.FROZEN] }] },
    { t: 1140, label: 'Garen Randuin', changes: [{ who: 'Garen', add: [ITEM.RANDUIN] }] },
  ] };
  const burstPath = { ...base, timeline: [
    { t: 960, label: 'Ahri Shadowflame', changes: [{ who: 'Ahri', add: [ITEM.SHADOWFLAME], level: 12 }] },
    { t: 1020, label: 'Ahri Rabadon', changes: [{ who: 'Ahri', add: [ITEM.RABADON], level: 13 }] },
    { t: 1080, label: 'Kai\'Sa Nashor', changes: [{ who: 'Kaisa', add: [3115], level: 13 }] },
    { t: 1140, label: 'Ahri Void Staff', changes: [{ who: 'Ahri', add: [ITEM.VOID], level: 14 }] },
    { t: 1200, label: 'Kai\'Sa Rabadon', changes: [{ who: 'Kaisa', add: [ITEM.RABADON], level: 14 }] },
  ] };

  it('Empfehlungen laufen auseinander, sobald es fachlich sinnvoll ist', () => {
    const a = playTimeline(armorPath);
    const b = playTimeline(burstPath);
    assert.equal(a.favorites[0], b.favorites[0], 'gleicher Ausgangspunkt');
    // Rechnerisch bestes Item am Ende beider Verläufe (ohne Hysterese):
    const endA = run({ ...armorPath, timeline: [] , enemies: resolveEnemies(armorPath) });
    const endB = run({ ...burstPath, timeline: [], enemies: resolveEnemies(burstPath) });
    assert.notEqual(endA.modelBestId, endB.modelBestId);
    assert.ok(PHYS_PEN(endA.modelBestId!), 'Rüstungsverlauf → Durchdringung');
    const bestB = endB.options[0];
    assert.ok(!PHYS_PEN(bestB.itemId) && bestB.gains.defense > 0.1, 'Burstverlauf → Sicherheit');
    // Der Advisor protokolliert im Burstverlauf die defensive Herausforderung sichtbar:
    assert.ok(b.history.some((h) => h.summary.includes(bestB.name)), 'Herausforderer erscheint im Verlauf');
  });

  it('jeder Wechsel nennt auslösende Beobachtungen, Attribution und Trade-off', () => {
    const syndra = loadScenario('syndra-base');
    const mrPath = { ...syndra, timeline: [
      { t: 960, label: 'Malphite FoN', changes: [{ who: 'Malphite', add: [ITEM.FON] }] },
      { t: 1020, label: 'Sejuani SV', changes: [{ who: 'Sejuani', add: [ITEM.SV] }] },
      { t: 1080, label: 'Ahri Banshee', changes: [{ who: 'Ahri', add: [ITEM.BANSHEE] }] },
      { t: 1140, label: 'Kai\'Sa Wit\'s End', changes: [{ who: 'Kaisa', add: [ITEM.WITS] }] },
    ] };
    const r = playTimeline(mrPath);
    const switches = r.history.filter((h) => h.kind === 'switch');
    assert.ok(switches.length >= 1, `kein Wechsel: ${r.history.map((h) => h.summary).join(' | ')}`);
    for (const s of switches) {
      assert.ok(s.triggers.length > 0);
      assert.ok(s.decisive.length > 0, 'Leave-one-out-Attribution vorhanden');
      assert.ok(s.tradeoff.length > 0);
    }
    assert.equal(r.favorites[r.favorites.length - 1], ITEM.VOID, 'MR-Stapel führt zu Magiedurchdringung');
  });

  it('Gegenbeispiel: reine MR auf einem Nebenziel ändert Jinx\' Empfehlung nicht', () => {
    const s = { ...base, timeline: [{ t: 960, label: 'Ahri Banshee', changes: [{ who: 'Ahri', add: [ITEM.BANSHEE] }] }] };
    const { favorites, history } = playTimeline(s);
    assert.equal(favorites[0], favorites[1]);
    assert.ok(!history.some((h) => h.kind === 'switch'));
  });
});

describe('Championverträgliche Kandidaten', () => {
  it('Jinx erhält keine AP-/Tank-Items, Zed keine Mana-Items, Fernkämpfer keine Nahkampf-Items', () => {
    const j = run(loadScenario('jinx-base'));
    for (const o of j.options) {
      const it = data.patch.items.get(o.itemId)!;
      assert.ok(!(it.stats.ap && !it.stats.ad), `${it.name} ist AP-Item`);
      assert.ok(!it.meleeOnly);
    }
    const z = run(loadScenario('zed-backline'));
    assert.ok(!z.options.some((o) => data.patch.items.get(o.itemId)!.tags.includes('mana')));
  });

  it('nicht unterstützte Champions erhalten keine generischen Empfehlungen', async () => {
    const { evaluate } = await import('../src/engine/engine');
    const { inputFor } = await import('./helpers');
    const s = variant(loadScenario('jinx-base'), { me: { champion: 'Ezreal' } as never });
    const r = evaluate(inputFor(s), data, (await import('../src/shared/types')).DEFAULT_SETTINGS);
    assert.equal(r.ok, false);
  });
});
