import type { EffectKind } from '../gamedata/mechanics';
import type { NeedKey } from '../shared/types';

// Alle Gewichte des Arbeitsmodells an einer Stelle. Das Modell ist KEINE
// validierte Gewinnwahrscheinlichkeit, sondern eine nachvollziehbare Heuristik.
// Tests prüfen Verhalten, nicht exakte Zahlen – Gewichte dürfen feinjustiert werden.

export interface Weights {
  threat: { power: number; participation: number; damageToMe: number; reported: number; enabler: number; floor: number };
  /** Beitrag eines Effekts zu einem Bedarf (Abdeckungsmatrix) */
  coverage: Record<NeedKey, Partial<Record<EffectKind, number>>>;
  /** Effekte, die nicht stapeln (nur die stärkste Quelle zählt) */
  nonStacking: EffectKind[];
  /** Grundbedarf an eigenem Fortschritt (Schaden) und Mobilität */
  baseOffenseNeed: number;
  baseMobilityNeed: number;
  scaling: Record<'weapon' | 'spirit' | 'hybrid' | 'melee', { W: number; S: number; M: number }>;
  continuityBonus: number;
  lowTierPenalty: number;
  unverifiedFactor: number;
  efficiencyExponent: number;
  decision: {
    /** Zwischenkauf lohnt, wenn er mindestens diesen Anteil des Sparziels bringt */
    interimMinRatio: number;
    /** …oder wenn das Sparziel noch so weit weg ist (Souls) */
    farAwaySouls: number;
    interimMinRatioFar: number;
    /** maximal tolerierte Verzögerung des Sparziels (s), falls Einnahmerate bekannt */
    maxDelaySec: number;
    /** Sparziel nur, wenn es mindestens so viel besser ist */
    saveMinGain: number;
    reachSouls: number;
  };
  swap: { minGain: number; componentOfPlanBonus: number };
  stability: { minRelativeGain: number; minAbsoluteGain: number; holdMs: number };
  alerts: { minRelevance: number; bundleMs: number; cooldownMs: number };
}

export const DEFAULT_WEIGHTS: Weights = {
  threat: { power: 0.55, participation: 0.1, damageToMe: 0.35, reported: 0.25, enabler: 0.35, floor: 0.05 },
  coverage: {
    bulletDefense: { bulletResist: 1, health: 0.45, barrier: 0.35, bulletImmunity: 0.8, enemyFireRateSlow: 0.6, enemyDamageReduction: 0.6, damageReflect: 0.3, bulletBurstReduction: 0.5, sustain: 0.2 },
    spiritDefense: { spiritResist: 1, health: 0.45, barrier: 0.35, spiritBurstReduction: 0.6, enemySpiritReduction: 0.7, enemyDamageReduction: 0.6, spellParry: 0.4, invulnerable: 0.3, sustain: 0.2 },
    meleeDefense: { meleeResist: 1, health: 0.4, enemySlow: 0.15 },
    ccDefense: { ccCleanse: 1, ccImmunity: 0.85, statusResist: 0.5, ccBarrier: 0.35, spellParry: 0.3, invulnerable: 0.25, escape: 0.15 },
    antiHeal: { antiHeal: 1 },
    burstDefense: { barrier: 0.6, deathPrevention: 0.8, invulnerable: 0.7, health: 0.35, spiritBurstReduction: 0.4, bulletBurstReduction: 0.4, escape: 0.3, bulletImmunity: 0.3 },
    offense: {},
    mobility: { mobility: 1, escape: 0.6 },
  },
  nonStacking: ['antiHeal', 'ccCleanse', 'ccImmunity', 'deathPrevention', 'invulnerable', 'spellParry', 'antiHealResist'],
  baseOffenseNeed: 0.62,
  baseMobilityNeed: 0.15,
  scaling: {
    weapon: { W: 1, S: 0.3, M: 0.25 },
    spirit: { W: 0.3, S: 1, M: 0.2 },
    hybrid: { W: 0.75, S: 0.75, M: 0.2 },
    melee: { W: 0.6, S: 0.4, M: 1 },
  },
  continuityBonus: 0.08,
  lowTierPenalty: 0.15,
  unverifiedFactor: 0.5,
  efficiencyExponent: 0.35,
  decision: { interimMinRatio: 0.8, farAwaySouls: 2400, interimMinRatioFar: 0.6, maxDelaySec: 75, saveMinGain: 0.08, reachSouls: 3200 },
  swap: { minGain: 0.08, componentOfPlanBonus: 0.15 },
  stability: { minRelativeGain: 0.12, minAbsoluteGain: 0.05, holdMs: 8000 },
  alerts: { minRelevance: 0.06, bundleMs: 5000, cooldownMs: 12000 },
};
