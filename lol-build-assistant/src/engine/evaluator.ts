import type { ChampionProfile, CombatRules, PlaystyleDef } from '../shared/types';
import { clamp, effectiveResist, resistMultiplier } from './combat';
import { simulateScenario, type TargetOverride } from './damage';
import type { ChampionEstimate } from './enemies';
import type { OwnStats } from './ownStats';
import type { ThreatProfile } from './threat';

export type Band = 'value' | 'low' | 'high';

export interface EvalContext {
  profile: ChampionProfile;
  playstyle: PlaystyleDef;
  ranks: Record<string, number>;
  enemies: ChampionEstimate[];
  allies: ChampionEstimate[];
  threat: ThreatProfile;
  rules: CombatRules;
  /** Antiheal-Abdeckung durch Mitspieler je Gegner-ID. */
  teamAntiheal: Map<string, number>;
  /** Teamanteil physischen Schadens (für Rüstungsreduktion als Utility). */
  allyPhysicalShare: number;
  /** Gegnerischer Heilbedarf ohne Team-Antiheal (0..1). */
  uncoveredHealing: number;
  myLine: number;
  scenarioWeights?: Record<string, number>;
}

export interface TargetBreakdown {
  enemyId: string;
  name: string;
  weight: number;
  fraction: number;
  effArmor: number;
  effMr: number;
}

export interface BuildValue {
  offense: number;
  defense: number;
  utility: number;
  utilityNotes: string[];
  targets: TargetBreakdown[];
}

function override(e: ChampionEstimate, band: Band): TargetOverride {
  if (band === 'value') return {};
  return { armor: e.armor[band], mr: e.mr[band], hp: e.hp[band] };
}

export function offenseValue(me: OwnStats, ctx: EvalContext, band: Band = 'value'): { value: number; targets: TargetBreakdown[] } {
  let total = 0;
  const targets: TargetBreakdown[] = [];
  const scen = ctx.playstyle.scenarios;
  const wSum = scen.reduce((s, x) => s + (ctx.scenarioWeights?.[x.id] ?? x.weight), 0) || 1;
  for (const e of ctx.enemies) {
    if (e.targetWeight <= 0) continue;
    let f = 0; let effArmor = 0; let effMr = 0;
    for (const s of scen) {
      const w = (ctx.scenarioWeights?.[s.id] ?? s.weight) / wSum;
      if (w <= 0) continue;
      const r = simulateScenario(me, s, e, {
        profile: ctx.profile, ranks: ctx.ranks, antihealTeamCoverage: ctx.teamAntiheal.get(e.champ.id) ?? 0,
      }, override(e, band));
      f += w * r.fraction;
      effArmor += w * r.effArmor; effMr += w * r.effMr;
    }
    total += e.targetWeight * f;
    targets.push({ enemyId: e.champ.id, name: e.champ.championName, weight: e.targetWeight, fraction: f, effArmor, effMr });
  }
  return { value: total, targets };
}

/**
 * Effektive Lebenspunkte gegen die bedrohungsgewichtete Schadensmischung.
 * Sondereffekte (Stasis, Wiederbelebung, Reinigung …) sind dokumentierte
 * Heuristiken (docs/ENGINE.md) und werden in der UI als solche gekennzeichnet.
 */
export function defenseValue(me: OwnStats, ctx: EvalContext): { ehp: number; notes: string[] } {
  const t = ctx.threat;
  let resistInFight = 0, aaRed = 0, critRed = 0, shield = 0;
  let stasis = false, revive = false, spellShield = false, cleanse = false, delay = 0;
  for (const { effect: e } of me.effects) {
    if (e.type === 'bonusResistInFight') resistInFight = Math.max(resistInFight, e.pct);
    if (e.type === 'aaDamageReduction') aaRed = Math.max(aaRed, e.value);
    if (e.type === 'critDamageReduction') critRed = Math.max(critRed, e.value);
    // Lifeline-Schilde wirken genau im Burst-Fenster; für Backliner gegen Burst höher gewichtet (Heuristik).
    if (e.type === 'lifeline') shield += (e.shield + e.perLevel * me.level) * 0.8 * (e.vs === 'magic' ? t.magic : 1) * (1 + (ctx.myLine < 0.5 ? 0.6 * t.burst : 0));
    if (e.type === 'stasis') stasis = true;
    if (e.type === 'revive') revive = true;
    if (e.type === 'spellShield') spellShield = true;
    if (e.type === 'cleanse') cleanse = true;
    if (e.type === 'damageDelay') delay = Math.max(delay, e.value);
  }
  const armor = effectiveResist(me.armor * (1 + 0.6 * resistInFight), { flatReduction: 0, pctReduction: 0, pctPen: t.armorPenPct, flatPen: t.lethality });
  const mr = effectiveResist(me.mr * (1 + 0.6 * resistInFight), { flatReduction: 0, pctReduction: 0, pctPen: t.magicPenPct, flatPen: t.magicPenFlat });
  const mPhys = resistMultiplier(armor);
  const mAuto = mPhys * (1 - aaRed) * (1 - critRed * clamp(t.critShare / Math.max(0.01, t.autoPhysical), 0, 1) * 0.4);
  const mult = (t.physical - t.autoPhysical) * mPhys + t.autoPhysical * mAuto + t.magic * resistMultiplier(mr) + t.true;
  let ehp = (me.hp + shield) / Math.max(0.05, mult);
  const notes: string[] = [];
  if (stasis) { ehp *= 1 + 0.3 * t.burst; notes.push('Stasis gegen Burst (Heuristik, erfordert Reaktion)'); }
  if (revive) { ehp *= 1.2; notes.push('Wiederbelebung (Heuristik)'); }
  if (spellShield) { ehp *= 1 + 0.06 + 0.1 * t.cleansableHardCc; notes.push('Zauberschild blockt einen Effekt (Heuristik)'); }
  if (cleanse) { ehp *= 1 + 0.3 * t.cleansableHardCc * (0.5 + 0.5 * t.burst); notes.push('Reinigung gegen reinigbare harte Kontrolle (Heuristik)'); }
  if (me.tenacity > 0) ehp *= 1 + 0.6 * me.tenacity * t.tenacityRelevantCc;
  if (delay > 0) { ehp *= 1 + (delay / 0.3) * 0.25 * t.burst; notes.push('Schadensverzögerung gegen Burst (Heuristik)'); }
  return { ehp, notes };
}

export function utilityValue(me: OwnStats, ctx: EvalContext): { value: number; notes: string[] } {
  let u = 0;
  const notes: string[] = [];
  let slow = 0;
  for (const { effect: e } of me.effects) {
    switch (e.type) {
      case 'slowUtility': slow = Math.max(slow, e.strength); break;
      case 'attackSpeedSlowAura': {
        const v = e.value * ctx.threat.autoPhysical * (ctx.myLine >= 0.5 ? 0.6 : 0.2);
        u += v; if (v > 0.01) notes.push('Angriffstempo-Verlangsamung gegen Autoattacker');
        break;
      }
      case 'armorShredStacking': {
        const v = ctx.allyPhysicalShare * 0.08;
        u += v; if (v > 0.01) notes.push('Rüstungsreduktion hilft physischen Mitspielern');
        break;
      }
      case 'multiTarget': {
        if (e.rangedOnly && !ctx.profile.ranged) break;
        if (e.meleeOnly && ctx.profile.ranged) break;
        u += e.share * 0.4; notes.push('Mehrzielschaden im Teamkampf');
        break;
      }
      case 'grievousWounds': {
        const v = 0.05 * ctx.uncoveredHealing;
        u += v; if (v > 0.01) notes.push('Antiheal auch für Ziele meines Teams');
        break;
      }
      default: break;
    }
  }
  if (slow > 0) { u += slow * 0.12; notes.push('Verlangsamung (Klebrigkeit/Peel)'); }
  if (ctx.playstyle.manaNeed > 0 && ctx.profile.resource === 'mana') {
    const target = 900 + 40 * me.level;
    u += ctx.playstyle.manaNeed * Math.min(1, me.mana / target) * 0.25;
  }
  if (ctx.playstyle.weights.utility >= 0.2) u += (me.ah / 100) * 0.15;
  return { value: u, notes };
}

export function evaluateBuild(me: OwnStats, ctx: EvalContext, band: Band = 'value'): BuildValue {
  const off = offenseValue(me, ctx, band);
  const def = defenseValue(me, ctx);
  const util = utilityValue(me, ctx);
  return { offense: off.value, defense: def.ehp, utility: util.value, utilityNotes: [...util.notes, ...def.notes], targets: off.targets };
}

export interface Gains { offense: number; defense: number; utility: number }

export function gainsBetween(before: BuildValue, after: BuildValue): Gains {
  return {
    offense: before.offense > 0 ? after.offense / before.offense - 1 : 0,
    defense: before.defense > 0 ? after.defense / before.defense - 1 : 0,
    utility: after.utility - before.utility,
  };
}

export function combine(g: Gains, w: { offense: number; defense: number; utility: number }): number {
  return w.offense * g.offense + w.defense * g.defense + w.utility * g.utility;
}

/** Defensivgewicht wird mit der Bedrohungslage skaliert und anschließend normiert. */
export function adaptiveWeights(playstyle: PlaystyleDef, threatIndex: number): { offense: number; defense: number; utility: number } {
  const w = { ...playstyle.weights };
  w.defense *= threatIndex;
  const s = w.offense + w.defense + w.utility;
  return { offense: w.offense / s, defense: w.defense / s, utility: w.utility / s };
}
