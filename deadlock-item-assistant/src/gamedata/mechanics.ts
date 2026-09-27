import type { ItemDef } from '../shared/gamedata';

// Übersetzt Item-Eigenschaften in normalisierte Effekte (0..~1.5 je Effekt).
// Zwei Quellen:
//  1) Automatisch aus eindeutigen Eigenschaften (Resistenzen, Leben, Waffenschaden …).
//  2) Kuratierte Spezialeffekte aus data/knowledge/effects.json, die gegen
//     Eigenschaften bzw. Beschreibungstext des aktuellen Builds geprüft werden.

export type EffectKind =
  | 'bulletResist' | 'spiritResist' | 'meleeResist' | 'health' | 'barrier' | 'sustain' | 'statusResist'
  | 'ccCleanse' | 'ccImmunity' | 'ccBarrier' | 'spellParry' | 'bulletImmunity' | 'invulnerable' | 'deathPrevention'
  | 'spiritBurstReduction' | 'bulletBurstReduction' | 'antiHealResist' | 'escape' | 'mobility'
  | 'antiHeal' | 'enemyDamageReduction' | 'enemyFireRateSlow' | 'enemySpiritReduction' | 'damageReflect'
  | 'enemySilence' | 'enemyDisarm' | 'enemyStun' | 'enemySlow' | 'enemyItemBlock'
  | 'bulletShred' | 'spiritShred' | 'resistIgnore' | 'percentDamage'
  | 'weaponDamage' | 'spiritPower' | 'cooldown' | 'meleeDamage' | 'economy';

export interface Effect {
  kind: EffectKind;
  /** normalisierte Stärke; 1.0 ≈ ein typischer, voller Effekt dieser Art */
  strength: number;
  /** Rohwert und Eigenschaft, aus der er stammt */
  raw?: number;
  prop?: string;
  delivery?: string;
  usableWhileStunned?: boolean;
  note?: string;
  origin: 'auto' | 'curated';
  verified: boolean;
}

export interface CuratedEffect {
  kind: EffectKind;
  prop?: string;
  desc?: string;
  delivery?: string;
  usableWhileStunned?: boolean;
  strength?: number;
  note?: string;
}

// Referenzgrößen für die Normalisierung (Rohwert / Referenz = Stärke 1.0). Arbeitsannahmen.
const REF: Partial<Record<EffectKind, number>> = {
  bulletResist: 30, spiritResist: 30, meleeResist: 25, health: 300, barrier: 400, statusResist: 30,
  antiHeal: 45, enemyDamageReduction: 30, enemyFireRateSlow: 30, enemySpiritReduction: 30,
  bulletShred: 12, spiritShred: 10, percentDamage: 2, cooldown: 20, meleeDamage: 25,
};

const clamp = (x: number, lo = 0, hi = 1.5) => Math.max(lo, Math.min(hi, x));

/** Aktive Items wirken nur zeitweise – grobe Verfügbarkeit aus der Abklingzeit. */
export function uptimeFactor(item: ItemDef): number {
  if (item.activation === 'passive') return 1;
  if (item.activation === 'toggle') return 0.8;
  const cd = item.props.AbilityCooldown ?? 30;
  return clamp(1.1 - cd / 90, 0.35, 0.9);
}

function autoEffects(item: ItemDef): Effect[] {
  const p = item.props;
  const out: Effect[] = [];
  // Umschaltbare Items (z. B. Blood Tribute) kosten während der Wirkung etwas (Leben) → abgeschwächt
  const toggle = item.activation === 'toggle' ? 0.6 : 1;
  const add = (kind: EffectKind, raw: number | undefined, prop: string, factor = 1) => {
    if (raw === undefined || raw <= 0) return;
    const ref = REF[kind] ?? 1;
    out.push({ kind, strength: clamp((raw / ref) * factor * toggle), raw, prop, origin: 'auto', verified: true });
  };
  add('bulletResist', p.BulletResist, 'BulletResist');
  add('bulletResist', p.BuffBulletResist, 'BuffBulletResist', uptimeFactor(item));
  if (p.BulletResistPerStack && p.MaxArmorStacks) add('bulletResist', p.BulletResistPerStack * p.MaxArmorStacks * 0.4, 'BulletResistPerStack');
  add('spiritResist', p.TechResist, 'TechResist');
  add('spiritResist', p.BuffTechResist, 'BuffTechResist', uptimeFactor(item));
  add('meleeResist', p.MeleeResistPercent, 'MeleeResistPercent');
  add('health', p.BonusHealth, 'BonusHealth');
  if (p.BonusBaseHealth) add('health', p.BonusBaseHealth * 10, 'BonusBaseHealth', uptimeFactor(item));
  const barrier = p.CombatBarrier ?? p.GuardianWardCombatBarrier;
  if (barrier) add('barrier', barrier, 'CombatBarrier', uptimeFactor(item));
  const lifesteal = Math.max(p.BulletLifestealPercent ?? 0, p.AbilityLifestealPercentHero ?? 0, p.ActiveBonusLifesteal ? p.ActiveBonusLifesteal * 0.3 : 0);
  const regen = (p.BonusHealthRegen ?? 0) + (p.Regeneration ?? 0) * 0.5;
  const healAmp = Math.max(p.HealAmpCastPercent ?? 0, p.HealAmpRegenPercent ?? 0);
  const sustain = lifesteal / 20 + regen / 8 + healAmp / 40 + (p.TotalHealthRegen ? (p.TotalHealthRegen / 400) * uptimeFactor(item) : 0);
  if (sustain > 0) out.push({ kind: 'sustain', strength: clamp(sustain * toggle), origin: 'auto', verified: true, prop: 'Lifesteal/Regen' });
  const status = Math.max(p.StatusResistancePercent ?? 0, (p.SlowResistancePercent ?? 0) * 0.4);
  add('statusResist', status, 'StatusResistancePercent');
  const mob = (p.BonusMoveSpeed ?? 0) / 2 + (p.BonusSprintSpeed ?? 0) / 3 + (p.Stamina ?? 0) * 0.35 + (p.ActiveBonusMoveSpeed ?? 0) / 4 * uptimeFactor(item);
  if (mob > 0) out.push({ kind: 'mobility', strength: clamp(mob * toggle), origin: 'auto', verified: true, prop: 'MoveSpeed/Stamina' });

  // Offensive Werte
  const wd = (p.BaseAttackDamagePercent ?? 0) / 25 + (p.BonusFireRate ?? 0) / 25 + (p.BonusClipSizePercent ?? 0) / 200
    + (p.HeadShotBonusDamage ?? 0) / 150 + (p.LongRangeBonusWeaponPower ?? 0) / 60 + (p.CloseRangeBonusWeaponPower ?? 0) / 50
    + (p.CritDamagePercent ?? 0) * (p.ProcChance ?? 0) / 100 / 25 + (p.ActiveBonusFireRate ?? 0) / 40 * uptimeFactor(item)
    + (p.WeaponPowerPerStack ?? 0) * (p.MaxStacks ?? 1) / 150 + (p.BaseAttackDamagePercentAtMaxDuration ?? 0) / 60
    + (p.RicochetDamagePercent ?? 0) / 120 + (p.DamagePerChain ?? 0) * (p.ProcChance ?? 0) / 100 / 8
    + (p.ProcBonusMagicDamage ?? 0) / 120 + (p.BulletsBonusMagicDamage ?? 0) / 60;
  if (wd > 0) out.push({ kind: 'weaponDamage', strength: clamp(wd * toggle), origin: 'auto', verified: true, prop: 'Weapon*' });
  const sp = (p.TechPower ?? 0) / 25 + (p.BonusSpirit ?? 0) / 25 + (p.SpiritPower ?? 0) / 25 + (p.ImbuedTechPower ?? 0) / 35
    + (p.TechPowerPercent ?? 0) / 20 + (p.MagicIncreasePerStack ?? 0) * (p.MaxStacks ?? 1) / 60 + (p.BonusAbilityDurationPercent ?? 0) / 60
    + (p.TechRangeMultiplier ?? 0) / 100 + (p.Damage && item.slot === 'spirit' ? p.Damage / 200 : 0) + (p.DamagePulseAmount ?? 0) / 60
    + (p.BonusAbilityCharges ?? 0) * 0.2 + (p.TechDamagePercent ?? 0) / 100;
  if (sp > 0) out.push({ kind: 'spiritPower', strength: clamp(sp * toggle), origin: 'auto', verified: true, prop: 'Spirit*' });
  add('cooldown', p.CooldownReduction, 'CooldownReduction');
  const md = (p.BonusMeleeDamagePercent ?? 0) + (p.BonusHeavyMeleeDamage ?? 0) * 0.3;
  add('meleeDamage', md, 'BonusMeleeDamagePercent');
  const bShred = Math.max(-(p.BulletArmorReduction ?? 0), -(p.BulletResistReduction ?? 0));
  add('bulletShred', bShred, 'BulletArmorReduction');
  const sShred = Math.max(-(p.TechArmorDamageReduction ?? 0), -(p.MagicResistReduction ?? 0));
  add('spiritShred', sShred, 'TechArmorDamageReduction');
  const slow = Math.max(p.SlowPercent ?? 0, p.MovementSpeedSlow ?? 0, p.MaxSlowPercent ?? 0);
  if (slow > 0) out.push({ kind: 'enemySlow', strength: clamp(slow / 40), raw: slow, prop: 'SlowPercent', origin: 'auto', verified: true });
  if (p.BonusGoldPerMinute || p.BonusSoulsPct || p.StackingGoldPerMinute) out.push({ kind: 'economy', strength: 0.6, origin: 'auto', verified: true });
  return out;
}

export function curatedEffects(item: ItemDef, curated: CuratedEffect[] | undefined): Effect[] {
  if (!curated) return [];
  return curated.map((c) => {
    const propOk = c.prop ? item.props[c.prop] !== undefined : true;
    const descOk = c.desc ? item.description.toLowerCase().includes(c.desc.toLowerCase()) : true;
    const raw = c.prop ? Math.abs(item.props[c.prop] ?? 0) : undefined;
    const ref = REF[c.kind];
    let strength = c.strength ?? (raw !== undefined && ref ? raw / ref : 1);
    if (c.delivery === 'active' || item.activation !== 'passive') strength *= c.kind === 'ccImmunity' || c.kind === 'ccCleanse' || c.kind === 'invulnerable' ? 1 : uptimeFactor(item);
    return {
      kind: c.kind, strength: clamp(strength), raw, prop: c.prop, delivery: c.delivery,
      usableWhileStunned: c.usableWhileStunned, note: c.note, origin: 'curated' as const, verified: propOk && descOk,
    };
  });
}

export function effectsOf(item: ItemDef, curated: CuratedEffect[] | undefined): Effect[] {
  return [...autoEffects(item), ...curatedEffects(item, curated)];
}
