import type { AbilityDef, ChampionProfile, DamageType, ScenarioDef } from '../shared/types';
import {
  averageStacksBeforeHit, clamp, combinePct, critMultiplier, effectiveResist, lerp, resistMultiplier,
} from './combat';
import type { ChampionEstimate } from './enemies';
import type { OwnStats } from './ownStats';

export interface TargetOverride {
  armor?: number;
  mr?: number;
  hp?: number;
}

export interface ScenarioResult {
  /** Schaden nach Resistenzen. */
  damage: number;
  byType: Record<DamageType, number>;
  /** Anteil der effektiven Ziel-LP (inkl. Schild, Heilung); bei kurzen Combos gedeckelt (Overkill). */
  fraction: number;
  ehp: number;
  effArmor: number;
  effMr: number;
  healInWindow: number;
  healReduced: number;
}

export interface DamageEnv {
  profile: ChampionProfile;
  ranks: Record<string, number>;
  antihealTeamCoverage: number;
}

function rankValue(v: number | number[] | undefined, rank: number): number {
  if (v === undefined) return 0;
  if (typeof v === 'number') return v;
  return v[Math.max(0, Math.min(v.length - 1, rank - 1))] ?? 0;
}

function abilityRaw(a: AbilityDef, rank: number, me: OwnStats, hp: number, missing: number): number {
  let base = 0;
  if (a.baseByLevel) base = a.baseByLevel[Math.max(0, Math.min(17, me.level - 1))];
  else if (a.base) base = rankValue(a.base, rank);
  let dmg = base
    + rankValue(a.adRatio, rank) * me.ad
    + rankValue(a.bonusAdRatio, rank) * (me.ad - me.baseAd)
    + rankValue(a.apRatio, rank) * me.ap
    + (a.armorRatio ?? 0) * me.armor;
  if (a.targetMaxHpPct !== undefined) dmg += rankValue(a.targetMaxHpPct, rank) * hp;
  if (a.targetMaxHpPctByLevel) dmg += a.targetMaxHpPctByLevel[Math.max(0, Math.min(17, me.level - 1))] * hp;
  if (a.targetMissingHpPct !== undefined) dmg += rankValue(a.targetMissingHpPct, rank) * hp * missing;
  return dmg * (a.hits ?? 1);
}

/**
 * Deterministische Schadensschätzung eines Szenarios gegen ein geschätztes Ziel.
 * Alle Annahmen (Uptime, Einsätze, fehlendes Leben) stammen aus dem Szenario des
 * Championprofils und werden in der UI angezeigt.
 */
export function simulateScenario(
  me: OwnStats,
  scenario: ScenarioDef,
  target: ChampionEstimate,
  env: DamageEnv,
  override: TargetOverride = {},
): ScenarioResult {
  const hp = override.hp ?? target.hp.value;
  const armor = override.armor ?? target.armor.value;
  const mr = override.mr ?? target.mr.value;
  const missing = scenario.targetMissingHp;
  const currentHpAvg = hp * (1 - missing);
  const melee = !env.profile.ranged;
  const D = scenario.duration;

  const raw: Record<DamageType, number> = { physical: 0, magic: 0, true: 0 };
  let physicalHits = 0;
  let abilityCasts = 0;
  let spellbladeTriggers = 0;
  let markIndex: { pct: number } | null = null;

  // --- Autoattacken ---------------------------------------------------------
  let asTotal = me.asTotal;
  for (const m of env.profile.combatMods ?? []) {
    const rank = env.ranks[m.ability] ?? 0;
    if (rank > 0) asTotal += me.asRatio * m.byRank[Math.min(m.byRank.length, rank) - 1] * m.uptime;
  }
  const as = Math.min(asTotal, 2.5);
  const autos = as * D * scenario.autoUptime;
  const critMult = critMultiplier(me.crit, 1 + (me.critDamage - 1) * (1 - target.critReduction));
  const autoDmg = me.ad * critMult * (scenario.autoMultiplier ?? 1) * (1 - target.aaReduction);
  raw.physical += autos * autoDmg;
  physicalHits += autos;
  let onHitApplications = autos;

  // --- Fähigkeiten -----------------------------------------------------------
  for (const [key, spec] of Object.entries(scenario.casts)) {
    const a = env.profile.abilities[key];
    if (!a) continue;
    const rank = env.ranks[key] ?? 0;
    if (rank <= 0) continue;
    let casts: number;
    if (spec === 'cd') {
      const cd = rankValue(a.cooldown, rank) || 10;
      casts = 1 + D / (cd * (100 / (100 + me.ah)));
    } else casts = spec;
    if (a.markPct) { markIndex = { pct: rankValue(a.markPct, rank) }; }
    let dmg = abilityRaw(a, rank, me, hp, missing) * casts;
    if (a.canCrit) dmg *= critMult;
    dmg *= scenario.abilityMultipliers?.[key] ?? 1;
    raw[a.damageType] += dmg;
    if (a.damageType === 'physical') physicalHits += casts * (a.hits ?? 1);
    if (a.appliesOnHit) onHitApplications += casts;
    if (key !== 'P') abilityCasts += casts;
    if (key !== 'P') spellbladeTriggers += casts;
  }

  // --- Item-Effekte ------------------------------------------------------------
  let armorPen = me.armorPenPct;
  let magicPen = me.magicPenPct;
  let armorShred = 0;
  let execute = 0;
  let shieldReaver = 0;
  let ownAntiheal = 0;
  let lowHpAmp: { threshold: number; amp: number } | null = null;
  const burnSeconds = Math.min(D, abilityCasts * 3);
  for (const { effect: e } of me.effects) {
    switch (e.type) {
      case 'onHitCurrentHp':
        raw[e.damageType] += onHitApplications * (melee ? e.melee : e.ranged) * currentHpAvg;
        break;
      case 'onHitFlat':
        raw[e.damageType] += onHitApplications * (e.value + (e.apRatio ?? 0) * me.ap);
        break;
      case 'everyNthHit': {
        const procs = Math.floor(onHitApplications / e.n + 0.34);
        const base = lerp(e.baseMin, e.baseMax, (me.level - 1) / 17) + (e.bonusAdRatio ?? 0) * (me.ad - me.baseAd);
        raw[e.damageType] += procs * base * (1 + (e.missingHpAmpMax ?? 0) * missing) * (melee ? 1 : e.rangedMultiplier ?? 1);
        break;
      }
      case 'selfMaxHpOnHit':
        raw[e.damageType] += onHitApplications * e.pct * me.hp;
        break;
      case 'spellblade': {
        const procs = Math.min(spellbladeTriggers, onHitApplications + 1, D / e.cooldown + 1);
        raw[e.damageType] += procs * (e.baseAdRatio * me.baseAd + e.apRatio * me.ap);
        break;
      }
      case 'maxHpBurst':
        if (autos + abilityCasts >= 2) raw[e.damageType] += (1 + Math.floor(D / e.cooldown)) * e.pct * hp;
        break;
      case 'burnMaxHp':
        raw[e.damageType] += e.pctPerSec * hp * Math.min(burnSeconds, e.durationSec * Math.max(1, abilityCasts));
        break;
      case 'armorShredStacking': {
        const avg = averageStacksBeforeHit(physicalHits, e.maxStacks);
        armorShred = Math.max(armorShred, avg * e.perStack);
        break;
      }
      case 'penRampInFight': {
        const avg = averageStacksBeforeHit(onHitApplications, e.rampHits) / e.rampHits;
        armorPen = combinePct(armorPen, e.armorPenMax * avg);
        magicPen = combinePct(magicPen, e.magicPenMax * avg);
        break;
      }
      case 'executeThreshold': execute = Math.max(execute, e.pct); break;
      case 'shieldReaver': shieldReaver = Math.max(shieldReaver, melee ? e.melee : e.ranged); break;
      case 'grievousWounds': {
        // "hit-taken" (Dornenpanzer) wirkt nur, wenn das Ziel mich mit Autos trifft.
        const cov = e.application === 'damage' ? 1 : (target.knowledge?.autoShare ?? 0.3) * (melee ? 0.9 : 0.4);
        ownAntiheal = Math.max(ownAntiheal, cov);
        break;
      }
      case 'damageSpike':
        if (raw.magic + raw.physical >= e.pctOfHp * hp) raw[e.damageType] += e.bonus + 0.1 * me.ap;
        break;
      case 'lowHpCritAmp': lowHpAmp = { threshold: e.threshold, amp: e.amp }; break;
      default: break;
    }
  }

  // --- Resistenzen -------------------------------------------------------------
  const effArmor = effectiveResist(armor, { flatReduction: 0, pctReduction: armorShred, pctPen: armorPen, flatPen: me.lethality });
  const effMr = effectiveResist(mr, { flatReduction: 0, pctReduction: 0, pctPen: magicPen, flatPen: me.magicPenFlat });
  const byType: Record<DamageType, number> = {
    physical: raw.physical * resistMultiplier(effArmor),
    magic: raw.magic * resistMultiplier(effMr),
    true: raw.true,
  };
  if (markIndex) {
    // Zed R: Anteil des übrigen (bereits reduzierten) Schadens als physischer Zusatz.
    const other = byType.physical + byType.magic + byType.true;
    byType.physical += markIndex.pct * other;
  }

  // --- Effektive LP des Ziels --------------------------------------------------
  const healInWindow = target.healPerSec * D;
  const gw = 0.4;
  const combined = 1 - (1 - ownAntiheal) * (1 - env.antihealTeamCoverage);
  const healReduced = healInWindow * gw * combined;
  const shield = target.shield * (1 - shieldReaver);
  const ehp = Math.max(1, hp * (1 - execute) + shield + healInWindow - healReduced);
  let damage = byType.physical + byType.magic + byType.true;
  if (lowHpAmp) {
    const f = damage / ehp;
    const portion = f > 0 ? clamp((f + missing - (1 - lowHpAmp.threshold)) / f, 0, 1) : 0;
    const bonus = (byType.magic + byType.true) * lowHpAmp.amp * portion;
    byType.magic += bonus;
    damage += bonus;
  }
  return {
    damage, byType, fraction: Math.min(scenario.overkillCap ?? (scenario.duration <= 4 ? 1.25 : Infinity), damage / ehp), ehp, effArmor, effMr, healInWindow, healReduced,
  };
}
