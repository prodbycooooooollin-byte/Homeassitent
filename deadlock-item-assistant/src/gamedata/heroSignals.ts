import type { HeroDef } from '../shared/gamedata';

// Leitet aus den Signaturfähigkeiten eines Heroes (Eigenschaften + offizielle
// Beschreibung) ab, welche harte Kontrolle und welche Heilung er mitbringt.
// Das ist eine datenbasierte Heuristik, keine Messung im Match.

export interface HeroSignals {
  ccTypes: { type: string; ability: string; weight: number }[];
  ccStrength: number;
  sustain: number;
  sustainAbilities: string[];
  appliesAntiHeal: boolean;
}

const CC_RULES: { type: string; weight: number; prop?: RegExp; desc?: RegExp }[] = [
  { type: 'Stun', weight: 1.0, prop: /^(?!Parried)\w*Stun\w*(Duration|OnLand|OnExplode)$/, desc: /\bstun/i },
  { type: 'Schlaf', weight: 0.9, prop: /^SleepDuration$/, desc: /\bsleep/i },
  { type: 'Immobilisierung', weight: 0.8, prop: /^(ImmobilizeDuration|RootDuration)$/, desc: /\b(immobiliz|root)/i },
  { type: 'Stille', weight: 0.7, prop: /^Silence\w*$/, desc: /\bsilenc/i },
  { type: 'Anheben', weight: 0.7, prop: /^(EnemyLiftDuration|LiftDuration)$/, desc: /\blift/i },
  { type: 'Entwaffnung', weight: 0.5, prop: /^DisarmDuration$/, desc: /\bdisarm/i },
  { type: 'Verwandlung', weight: 0.7, prop: /^HexDuration$/, desc: /\bhex\b/i },
  { type: 'Heranziehen', weight: 0.6, desc: /\b(pull|hook|grab)/i },
  { type: 'Fesselung', weight: 0.5, prop: /^Tether\w*Duration$/, desc: /\b(tether|chain)/i },
  { type: 'Einfrieren', weight: 0.8, prop: /^FreezeDuration$/, desc: /\bfreez/i },
  { type: 'Furcht', weight: 0.6, desc: /\bfear/i },
  { type: 'Versteinerung', weight: 0.9, desc: /\bpetrif/i },
];

const HEAL_PROP = /^(Heal\w*|\w*Lifesteal\w*|LifeSteal\w*|\w*HealthRegen|HealingPerSecond|HealAmount|MissingHPHeal)$/;
const HEAL_DESC = /\bheal(s|ing)?\s+(you|yourself|him|her|them|the caster)|lifesteal|restore(s)? health/i;

export function deriveHeroSignals(hero: HeroDef): HeroSignals {
  const cc = new Map<string, { type: string; ability: string; weight: number }>();
  const sustainAbilities: string[] = [];
  let sustain = 0;
  let appliesAntiHeal = false;
  for (const a of hero.abilities) {
    const propNames = Object.keys(a.props);
    for (const r of CC_RULES) {
      const byProp = r.prop ? propNames.some((p) => r.prop!.test(p) && a.props[p] > 0) : false;
      const byDesc = r.desc ? r.desc.test(a.description) : false;
      // Beschreibungstreffer zählen nur, wenn sie sich auf Gegner beziehen (grobe Filterung)
      if (byProp || (byDesc && /enem|target|hit/i.test(a.description))) {
        if (!cc.has(r.type)) cc.set(r.type, { type: r.type, ability: a.className, weight: r.weight });
      }
    }
    const healProp = propNames.some((p) => HEAL_PROP.test(p) && a.props[p] > 0);
    if (healProp || HEAL_DESC.test(a.description)) { sustain += 0.35; sustainAbilities.push(a.className); }
    if (a.props.HealAmpReceivePenaltyPercent !== undefined) appliesAntiHeal = true;
  }
  const weights = [...cc.values()].map((c) => c.weight).sort((x, y) => y - x);
  // stärkste Kontrolle zählt voll, weitere abnehmend
  const ccStrength = Math.min(1.5, weights.reduce((s, w, i) => s + w * (i === 0 ? 1 : 0.4), 0));
  return { ccTypes: [...cc.values()], ccStrength, sustain: Math.min(1, sustain), sustainAbilities, appliesAntiHeal };
}
