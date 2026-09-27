import type { Catalog } from '../gamedata/catalog';
import type { EffectKind } from '../gamedata/mechanics';
import type { NeedKey, ScoreTerm } from '../shared/types';
import { type Assessment, NEED_KEYS } from './assess';
import type { Weights } from './weights';

// Gemeinsame Bewertungsgrundlage für „Jetzt kaufen“, Sparziel und Austausch.
// Nutzen = gewichteter Counter-Nutzen + Hero-/Build-Synergie + Zeitpunkt
//          − Redundanz (über abnehmenden Grenznutzen) − Verzögerung (in advisor.ts) − Austauschkosten (in advisor.ts)

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const f = (x: number) => 1 - Math.exp(-1.2 * Math.max(0, x));

/** Abdeckung eines Bedarfs durch eine Menge von Items (mit Nicht-Stapel-Regel) */
export function coverage(cat: Catalog, w: Weights, items: string[], need: NeedKey, a: Assessment): number {
  const matrix = w.coverage[need];
  let total = 0;
  const maxByKind = new Map<EffectKind, number>();
  for (const i of items) {
    for (const e of cat.effects.get(i) ?? []) {
      const c = matrix[e.kind];
      if (!c) continue;
      let v = e.strength * c * applicability(cat, i, e.kind, e.delivery, e.usableWhileStunned, need, a);
      if (w.nonStacking.includes(e.kind)) { maxByKind.set(e.kind, Math.max(maxByKind.get(e.kind) ?? 0, v)); v = 0; }
      total += v;
    }
  }
  for (const v of maxByKind.values()) total += v;
  return total;
}

/** Ist der Effekt in der aktuellen Lage wirklich nutzbar? */
export function applicability(cat: Catalog, item: string, kind: EffectKind, delivery: string | undefined, usableWhileStunned: boolean | undefined, need: NeedKey, a: Assessment): number {
  const s = a.me.scaling;
  if (kind === 'antiHeal') {
    // Heilungsreduktion muss über einen Schadensweg ankommen, den ich tatsächlich nutze.
    const byDelivery: Record<string, number> = { bullet: clamp(s.W), spirit: clamp(s.S), headshot: clamp(s.W) * 0.7, active: 0.85 };
    return byDelivery[delivery ?? 'active'] ?? 0.7;
  }
  if (need === 'ccDefense' && (kind === 'ccCleanse' || kind === 'ccImmunity') && usableWhileStunned === false) {
    // Gegen Stun/Schlaf hilft ein aktiver Cleanse nicht (nicht nutzbar unter Stun); Immunität nur vorbeugend.
    const stunHeavy = a.threats.reduce((m, t) => Math.max(m, t.ccTypes.some((c) => c === 'Stun' || c === 'Schlaf' || c === 'Versteinerung') ? t.threat : 0), 0);
    return kind === 'ccImmunity' ? 0.75 - 0.15 * stunHeavy : 0.8 - 0.4 * stunHeavy;
  }
  if (kind === 'sustain' && a.enemyAntiHeal > 0) return 1 - 0.5 * a.enemyAntiHeal;
  if (kind === 'enemyFireRateSlow' && delivery === 'spirit') return clamp(s.S);
  if (kind === 'enemySpiritReduction' && delivery === 'bullet') return clamp(s.W);
  if (kind === 'enemyDamageReduction' && delivery === 'bullet') return clamp(s.W);
  void cat; void item;
  return 1;
}

export function offenseValue(cat: Catalog, item: string, a: Assessment): number {
  const s = a.me.scaling;
  const e = (k: EffectKind) => cat.effectStrength(item, k);
  const shredNeed = 0.35 + 0.65 * Math.max(a.enemyBulletResist, a.enemySpiritResist);
  const ccUtility = 0.2 * (1 - 0.6 * a.enemyCcImmunity);
  const early = a.me.expectedTier < 2 ? 1 : 0.2;
  return s.W * e('weaponDamage')
    + s.S * (e('spiritPower') + 0.5 * e('cooldown'))
    + s.M * e('meleeDamage')
    + (s.W * e('bulletShred') * (0.3 + a.enemyBulletResist) + s.S * e('spiritShred') * (0.3 + a.enemySpiritResist)) * 0.6
    + e('resistIgnore') * shredNeed * 0.4
    + e('percentDamage') * (0.25 + 0.6 * a.enemyTankiness)
    + (e('enemyStun') + e('enemySilence') + e('enemyDisarm') + 0.5 * e('enemySlow') + e('enemyItemBlock')) * ccUtility
    + e('economy') * 0.5 * early;
}

export interface ItemEval {
  utility: number;
  terms: ScoreTerm[];
  /** Grenznutzen je Bedarf (für Begründungen) */
  perNeed: Partial<Record<NeedKey, number>>;
  offense: number;
}

const NEED_LABEL: Record<NeedKey, string> = {
  bulletDefense: 'Schutz vor Waffenschaden', spiritDefense: 'Schutz vor Spirit-Schaden', meleeDefense: 'Schutz vor Nahkampf',
  ccDefense: 'Schutz vor Kontrolle', antiHeal: 'Heilungsreduktion', burstDefense: 'Überleben gegen Burst', offense: 'eigener Schaden', mobility: 'Mobilität',
};
export const needLabel = (k: NeedKey) => NEED_LABEL[k];

/** Grenznutzen eines Items gegeben die übrigen Items (base) */
export function evaluateItem(cat: Catalog, w: Weights, a: Assessment, item: string, base: string[]): ItemEval {
  const terms: ScoreTerm[] = [];
  const perNeed: Partial<Record<NeedKey, number>> = {};
  let counter = 0;
  let redundancy = 0;
  for (const k of NEED_KEYS) {
    if (k === 'offense') continue;
    const need = a.needs.values[k];
    if (need <= 0.01) continue;
    const have = coverage(cat, w, base, k, a);
    const withIt = coverage(cat, w, [...base, item], k, a);
    const marginal = f(withIt) - f(have);
    const standalone = f(withIt - have);
    if (standalone > 0.02 && marginal < standalone) redundancy += need * (standalone - marginal);
    // Bedarf mit belegter Ursache (gemeldet / Schadensfenster) wiegt schwerer
    const v = need * marginal * (a.needs.focus.includes(k) ? 1.35 : 1);
    if (v > 0.005) { perNeed[k] = v; counter += v; }
  }
  const offense = a.needs.values.offense * offenseValue(cat, item, a) * 0.9;
  if (counter > 0) terms.push({ key: 'counter', label: 'Counter-Nutzen', value: counter });
  if (offense > 0) terms.push({ key: 'synergy', label: 'Hero-/Build-Synergie', value: offense });
  if (redundancy > 0.02) terms.push({ key: 'redundancy', label: 'bereits abgedeckt', value: -redundancy });
  const it = cat.item(item);
  let timing = 0;
  if (it && it.tier < a.me.expectedTier - 1.5) timing = -w.lowTierPenalty * (a.me.expectedTier - 1.5 - it.tier + 1);
  if (timing) terms.push({ key: 'timing', label: 'zu schwach für die Spielphase', value: timing });
  const utility = counter + offense + timing;
  return { utility, terms, perNeed, offense };
}
