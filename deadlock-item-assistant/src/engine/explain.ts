import type { Catalog } from '../gamedata/catalog';
import type { EnemyThreat, NeedKey, Provenance, Recommendation } from '../shared/types';
import type { Assessment } from './assess';
import type { Ranked } from './advisor';
import { evaluateItem } from './score';
import { DEFAULT_WEIGHTS } from './weights';

// Begründungen entstehen ausschließlich aus den Faktoren, die zur Auswahl geführt haben
// (Grenznutzen je Bedarf, Treiber-Gegner, Synergie, Kosten). Keine Floskeln wie „Meta“.

const PROV_TAG: Partial<Record<Provenance, string>> = {
  'from-build': 'aus Build geschätzt',
  'damage-window': 'aus Schadensfenster erkannt',
  reported: 'von dir gemeldet',
  curated: 'aus Heldenprofil geschätzt',
};

function topDriver(a: Assessment, need: NeedKey): EnemyThreat | null {
  const d = a.needs.drivers[need][0];
  return d ? a.threats.find((t) => t.key === d.enemyKey) ?? null : null;
}

function strongest(a: Assessment): EnemyThreat | null { return a.threats[0] ?? null; }

function enemyPhrase(a: Assessment, t: EnemyThreat): string {
  const s = strongest(a);
  if (s && s.key === t.key && t.threat >= 0.45) return `${t.heroName} (aktuell stärkster Gegner)`;
  if (t.economy.ratioToAvg !== null && t.economy.ratioToAvg >= 1.25) return `${t.heroName} (wirtschaftlich vorne)`;
  return t.heroName;
}

function needSentence(cat: Catalog, a: Assessment, need: NeedKey): { text: string; tags: string[] } {
  const t = topDriver(a, need);
  const tags: string[] = [];
  if (!t) return { text: '', tags };
  const who = enemyPhrase(a, t);
  const tag = PROV_TAG[t.damageMix.provenance];
  switch (need) {
    case 'antiHeal':
      return { text: `Gegen die Heilung von ${who}${t.sustainSources.length ? ` (${t.sustainSources.slice(0, 2).join(', ')})` : ''}.`, tags };
    case 'ccDefense': {
      const types = t.ccTypes.slice(0, 2).join('/') || 'Kontrolle';
      const enabler = t.enabler > 0.35 && strongest(a)?.key !== t.key ? `, die ${strongest(a)!.heroName}s Schaden ermöglicht` : '';
      if (a.threats.some((x) => x.key === t.key && x.factors.some((f) => f.provenance === 'reported'))) tags.push('von dir gemeldet');
      return { text: `Schutz vor ${types} von ${who}${enabler}.`, tags };
    }
    case 'bulletDefense':
      if (tag) tags.push(tag);
      return { text: `Weniger Waffenschaden von ${who}.`, tags };
    case 'spiritDefense':
      if (tag) tags.push(tag);
      return { text: `Weniger Spirit-Schaden von ${who}.`, tags };
    case 'meleeDefense':
      return { text: `Weniger Nahkampfschaden von ${who}.`, tags };
    case 'burstDefense':
      return { text: `Überlebst den Burst von ${who} eher.`, tags };
    case 'mobility':
      return { text: 'Mehr Mobilität zum Ausweichen und Nachsetzen.', tags };
    default:
      void cat;
      return { text: '', tags };
  }
}

function synergySentence(cat: Catalog, a: Assessment, c: Ranked): string {
  const s = a.me.scaling;
  const kind = s.W >= s.S * 1.2 ? 'Waffen' : s.S >= s.W * 1.2 ? 'Spirit' : 'Hybrid';
  if (c.consumes.length) return `Upgrade von ${c.consumes.map((x) => cat.itemName(x)).join(' + ')} – zahlt nur die Differenz, kein neuer Slot.`;
  const e = (k: Parameters<Catalog['effectStrength']>[1]) => cat.effectStrength(c.item, k);
  if (e('bulletShred') > 0.3 && a.enemyBulletResist > 0.25) return 'Senkt die Bullet-Resistenz, die die Gegner gerade aufbauen.';
  if (e('percentDamage') > 0.3 && a.enemyTankiness > 0.35) return 'Prozentschaden gegen die zähen Gegner.';
  return `Nächster Schadensschritt für deinen ${kind}-Build.`;
}

function drawback(cat: Catalog, a: Assessment, c: Ranked, budget: number | null): string | null {
  const it = cat.item(c.item)!;
  const red = c.terms.find((t) => t.key === 'redundancy');
  if (c.restricted) return `${c.restricted} – mit Vorsicht.`;
  const eff = cat.effects.get(c.item) ?? [];
  const notUsableStunned = eff.find((e) => e.usableWhileStunned === false && (e.kind === 'ccImmunity' || e.kind === 'ccCleanse'));
  if (notUsableStunned) return `Unter Stun nicht nutzbar – ${notUsableStunned.note ?? 'rechtzeitig aktivieren'}.`;
  if (red && red.value < -0.05) return 'Teilweise schon durch deine Items abgedeckt – Zusatznutzen geringer.';
  if (it.activation === 'active') return 'Aktives Item: wirkt nur mit gutem Timing.';
  if (budget !== null && c.price > budget * 0.8 && c.price >= 3200) return `Teuer (${c.price}) – bindet einen großen Teil deiner Souls.`;
  if (c.score > 0 && c.terms.find((t) => t.key === 'counter') && !c.terms.find((t) => t.key === 'synergy')) return 'Kein direkter Schadenszuwachs für dich.';
  void a;
  return null;
}

function reasonParts(cat: Catalog, a: Assessment, c: Ranked): { lines: string[]; tags: string[] } {
  const needs = (Object.entries(c.perNeed) as [NeedKey, number][]).sort((x, y) => y[1] - x[1]);
  const syn = c.terms.find((t) => t.key === 'synergy')?.value ?? 0;
  const lines: string[] = [];
  const tags: string[] = [];
  const counterTotal = needs.reduce((s, [, v]) => s + v, 0);
  const parts: { v: number; text: string; tags: string[] }[] = [];
  for (const [k, v] of needs.slice(0, 3)) {
    const n = needSentence(cat, a, k);
    if (n.text) parts.push({ v, text: n.text, tags: n.tags });
  }
  if (syn > 0.03 || c.consumes.length) parts.push({ v: syn + (c.consumes.length ? 0.1 : 0), text: synergySentence(cat, a, c), tags: [] });
  parts.sort((x, y) => y.v - x.v);
  for (const p of parts) { if (!lines.includes(p.text)) lines.push(p.text); tags.push(...p.tags); }
  if (!lines.length) lines.push(counterTotal > 0 ? 'Deckt eine aktuelle Lücke ab.' : 'Solider Wertzuwachs ohne klaren Gegner-Bezug.');
  return { lines, tags: [...new Set(tags)] };
}

export interface BuyCtx {
  affordable: 'yes' | 'no' | 'unknown';
  budget: number | null;
  income: number | null;
  slotFree: boolean;
  interimFor?: Ranked | null;
  isComponentOf?: Ranked | null;
  delaySec?: number | null;
}

export function describeBuy(cat: Catalog, a: Assessment, c: Ranked, ctx: BuyCtx): Recommendation {
  const { lines, tags } = reasonParts(cat, a, c);
  let short = lines[0];
  if (ctx.isComponentOf) short = `Erster Schritt zu ${cat.itemName(ctx.isComponentOf.item)} – ${lines[0].charAt(0).toLowerCase()}${lines[0].slice(1)}`;
  else if (ctx.interimFor) short = `Günstige Zwischenlösung, ohne ${cat.itemName(ctx.interimFor.item)} stark zu verzögern.`;
  const long = [...lines];
  if (ctx.interimFor && !ctx.isComponentOf) long.unshift(`Zwischenkauf: bringt jetzt ${Math.round((c.score / Math.max(0.001, ctx.interimFor.score)) * 100)} % des Nutzens von ${cat.itemName(ctx.interimFor.item)}.`);
  if (ctx.delaySec) long.push(`Verzögert das Sparziel um ca. ${Math.round(ctx.delaySec)} s (geschätzt aus deiner Einnahmerate).`);
  if (!ctx.slotFree) long.push('Kein freier Slot – siehe Austauschvorschlag.');
  return {
    kind: 'buy', item: c.item, price: c.price, missing: ctx.budget !== null ? Math.max(0, c.price - ctx.budget) : null, etaSec: null,
    affordable: ctx.affordable, consumes: c.consumes, reasonShort: short, reasonsLong: long.slice(0, 3), drawback: drawback(cat, a, c, ctx.budget),
    provenanceTags: tags, score: c.score,
  };
}

export function describeSave(cat: Catalog, a: Assessment, c: Ranked, ctx: { budget: number | null; income: number | null; versus: Ranked | null; interimWorth: boolean }): Recommendation {
  const { lines, tags } = reasonParts(cat, a, c);
  const missing = ctx.budget !== null ? Math.max(0, c.price - ctx.budget) : null;
  const eta = missing !== null && missing > 0 && ctx.income ? missing / ctx.income : null;
  const long = [...lines];
  if (ctx.versus && ctx.versus.item !== c.item) {
    const pct = Math.round((c.score / Math.max(0.001, ctx.versus.score) - 1) * 100);
    if (pct > 0) long.push(`Etwa ${pct} % mehr Modellnutzen als ${cat.itemName(ctx.versus.item)} (Arbeitsmodell, keine Siegchance).`);
  }
  return {
    kind: 'save', item: c.item, price: c.price, missing, etaSec: eta, affordable: missing === 0 ? 'yes' : missing === null ? 'unknown' : 'no',
    consumes: c.consumes, reasonShort: lines[0], reasonsLong: long.slice(0, 3), drawback: drawback(cat, a, c, ctx.budget), provenanceTags: tags, score: c.score,
  };
}

export function primaryReasonText(cat: Catalog, primary: 'buy' | 'save' | 'none', A: Ranked | null, B: Ranked | null, x: { isComponent: boolean; delaySec: number | null; ratio: number; missing: number; far: boolean }): string {
  if (primary === 'none') return 'Kein sinnvoller Kauf gefunden.';
  if (!B || (A && A.item === B.item)) return 'Bester sinnvoller Kauf, jetzt bezahlbar.';
  if (primary === 'save') {
    if (!A) return `Weiter sparen: nichts Bezahlbares lohnt sich gerade (fehlen ${x.missing}).`;
    return `Weiter sparen: ${cat.itemName(A.item)} brächte nur ${Math.round(x.ratio * 100)} % des Nutzens${x.delaySec ? ` und verzögert ${cat.itemName(B.item)} um ca. ${Math.round(x.delaySec)} s` : ''}.`;
  }
  if (x.isComponent) return `Jetzt die Komponente kaufen – kein Umweg zu ${cat.itemName(B.item)}.`;
  if (x.far) return `Jetzt kaufen: bis ${cat.itemName(B.item)} fehlen noch ${x.missing} Souls.`;
  return `Jetzt kaufen: Zwischenlösung lohnt sich (${Math.round(x.ratio * 100)} % des Nutzens).`;
}

const NEED_WORD: Record<NeedKey, string> = {
  bulletDefense: 'Schutz vor Waffenschaden', spiritDefense: 'Schutz vor Spirit-Schaden', meleeDefense: 'Nahkampfschutz', ccDefense: 'CC-Schutz',
  antiHeal: 'Heilungsreduktion', burstDefense: 'Burst-Schutz', offense: 'Schaden', mobility: 'Mobilität',
};

export function describeSwap(cat: Catalog, a: Assessment, sell: string, buy: string, keep: number, value: number): { gain: string; loss: string } {
  const rest = a.me.items.filter((i) => i !== sell);
  const evB = evaluateItem(cat, DEFAULT_WEIGHTS, a, buy, rest);
  const evS = evaluateItem(cat, DEFAULT_WEIGHTS, a, sell, rest);
  const bestGain = (Object.entries(evB.perNeed) as [NeedKey, number][]).sort((x, y) => y[1] - x[1])[0];
  const bestLoss = (Object.entries(evS.perNeed) as [NeedKey, number][]).sort((x, y) => y[1] - x[1])[0];
  const gain = bestGain ? `+ ${NEED_WORD[bestGain[0]]}` : evB.offense > 0 ? '+ Schaden' : '+ Wert';
  const lossParts: string[] = [];
  if (bestLoss && bestLoss[1] > 0.02) lossParts.push(`− ${NEED_WORD[bestLoss[0]]}`);
  if (evS.offense > 0.05) lossParts.push('− etwas Schaden');
  const it = cat.item(sell);
  if (it && cat.upgradesOf.get(sell)?.length) lossParts.push(`Komponente für ${cat.upgradesOf.get(sell)!.slice(0, 2).map((x) => cat.itemName(x)).join('/')}`);
  void keep; void value;
  return { gain, loss: lossParts.join(', ') || '− kaum spürbar' };
}
