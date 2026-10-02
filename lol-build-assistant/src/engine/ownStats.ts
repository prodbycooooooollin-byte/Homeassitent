import { statAtLevel } from '../patch/patchData';
import type { ChampionProfile, CombatRules, ItemDef, ItemEffect } from '../shared/types';
import { combinePct, removePct } from './combat';
import type { EngineInput } from './input';

/** Eigene Kampfwerte, auf die Kandidaten-Items angewendet werden. */
export interface OwnStats {
  level: number;
  baseAd: number;
  ad: number;
  ap: number;
  apAmp: number;
  asBase: number;
  asRatio: number;
  asTotal: number;
  crit: number;
  critDamage: number;
  hp: number;
  armor: number;
  mr: number;
  mana: number;
  ah: number;
  lethality: number;
  armorPenPct: number;
  magicPenFlat: number;
  magicPenPct: number;
  lifesteal: number;
  tenacity: number;
  /** Multiplikator auf zusätzliche Rüstung aus Kit-Effekten (z. B. Malphite W). */
  armorMultiplier: number;
  effects: { itemId: number; effect: ItemEffect }[];
  itemIds: number[];
  /** observed = aus Live-Werten; derived = aus Basiswerten + Items berechnet. */
  kind: 'observed' | 'derived';
  notes: string[];
}

export function abilityRanks(profile: ChampionProfile, level: number, observed?: EngineInput['me']['abilityRanks']): Record<string, number> {
  const r = level >= 16 ? 3 : level >= 11 ? 2 : level >= 6 ? 1 : 0;
  const ranks: Record<string, number> = { R: r, P: 1 };
  const basics = profile.skillOrder;
  let points = Math.max(0, level - r);
  for (const k of basics) ranks[k] = 0;
  // Stufen 1-3: je ein Punkt, danach Maximierung in Profil-Reihenfolge.
  for (const k of ['Q', 'W', 'E'] as const) {
    if (points <= 0) break;
    ranks[k] = 1;
    points--;
  }
  for (const k of basics) {
    const add = Math.min(points, 4);
    ranks[k] += add;
    points -= add;
  }
  if (observed) {
    for (const [k, v] of Object.entries(observed)) if (typeof v === 'number' && v >= 0) ranks[k] = v;
  }
  return ranks;
}

function selfArmorMultiplier(profile: ChampionProfile, ranks: Record<string, number>): number {
  let m = 1;
  for (const mod of profile.selfMods ?? []) {
    if (mod.stat === 'armor' && mod.pct) {
      const rank = mod.ability ? ranks[mod.ability] ?? 0 : 1;
      const v = mod.byRank ? (rank > 0 ? mod.byRank[rank - 1] : 0) : mod.value ?? 0;
      m *= 1 + v;
    }
  }
  return m;
}

function selfArmorPen(profile: ChampionProfile, ranks: Record<string, number>): number {
  let pen = 0;
  for (const mod of profile.selfMods ?? []) {
    if (mod.stat === 'armorPenPct') {
      const rank = mod.ability ? ranks[mod.ability] ?? 0 : 1;
      pen = combinePct(pen, mod.byRank ? (rank > 0 ? mod.byRank[rank - 1] : 0) : mod.value ?? 0);
    }
  }
  return pen;
}

function emptyStats(profile: ChampionProfile, level: number, rules: CombatRules, ranks: Record<string, number>): OwnStats {
  const b = profile.base;
  const baseAd = statAtLevel(b.ad ?? 60, b.adg ?? 3, level, rules);
  const asBase = b.as ?? 0.625;
  const asRatio = b.asRatio ?? asBase;
  const bonusAsFromLevel = ((b.asg ?? 0.02) * Math.max(0, level - 1) * (rules.statGrowth.a + rules.statGrowth.b * Math.max(0, level - 1)));
  const armorMultiplier = selfArmorMultiplier(profile, ranks);
  return {
    level,
    baseAd,
    ad: baseAd,
    ap: 0,
    apAmp: 0,
    asBase,
    asRatio,
    asTotal: asBase + asRatio * bonusAsFromLevel,
    crit: 0,
    critDamage: rules.baseCritDamage,
    hp: statAtLevel(b.hp, b.hpg, level, rules),
    armor: statAtLevel(b.ar, b.arg, level, rules) * armorMultiplier,
    mr: statAtLevel(b.mr, b.mrg, level, rules),
    mana: profile.resource === 'mana' ? statAtLevel(b.mana ?? 300, b.manag ?? 40, level, rules) : 0,
    ah: 0,
    lethality: 0,
    armorPenPct: selfArmorPen(profile, ranks),
    magicPenFlat: 0,
    magicPenPct: 0,
    lifesteal: 0,
    tenacity: 0,
    armorMultiplier,
    effects: [],
    itemIds: [],
    kind: 'derived',
    notes: [],
  };
}

/** Wendet ein Item additiv (sign=+1) oder subtraktiv (sign=-1) an. */
export function applyItem(s: OwnStats, item: ItemDef, sign: 1 | -1): OwnStats {
  const o: OwnStats = { ...s, effects: [...s.effects], itemIds: [...s.itemIds] };
  const st = item.stats;
  const oldAmp = o.apAmp;
  let newAmp = oldAmp;
  for (const e of item.effects ?? []) if (e.type === 'apAmp') newAmp += sign * e.value;
  if (newAmp !== oldAmp) o.ap = (o.ap / (1 + oldAmp)) * (1 + newAmp);
  o.apAmp = newAmp;
  o.ad += sign * (st.ad ?? 0);
  o.ap += sign * (st.ap ?? 0) * (1 + o.apAmp);
  o.asTotal += sign * o.asRatio * (st.as ?? 0);
  o.crit += sign * (st.crit ?? 0);
  o.critDamage += sign * (st.critDamage ?? 0);
  o.hp += sign * (st.hp ?? 0);
  o.armor += sign * (st.armor ?? 0) * o.armorMultiplier;
  o.mr += sign * (st.mr ?? 0);
  o.mana += sign * (st.mana ?? 0);
  o.ah += sign * (st.ah ?? 0);
  o.lethality += sign * (st.lethality ?? 0);
  o.magicPenFlat += sign * (st.magicPenFlat ?? 0);
  o.lifesteal += sign * (st.lifesteal ?? 0);
  o.tenacity = sign > 0 ? combinePct(o.tenacity, st.tenacity ?? 0) : removePct(o.tenacity, st.tenacity ?? 0);
  if (st.armorPenPct) o.armorPenPct = sign > 0 ? combinePct(o.armorPenPct, st.armorPenPct) : removePct(o.armorPenPct, st.armorPenPct);
  if (st.magicPenPct) o.magicPenPct = sign > 0 ? combinePct(o.magicPenPct, st.magicPenPct) : removePct(o.magicPenPct, st.magicPenPct);
  for (const e of item.effects ?? []) if (e.type === 'baseAdPct') o.ad += sign * e.value * o.baseAd;
  if (sign > 0) {
    for (const effect of item.effects ?? []) o.effects.push({ itemId: item.id, effect });
    o.itemIds.push(item.id);
  } else {
    const idx = o.itemIds.indexOf(item.id);
    if (idx >= 0) o.itemIds.splice(idx, 1);
    // Effekte genau einer Instanz entfernen (Duplikate bleiben erhalten).
    let toRemove = (item.effects ?? []).length;
    o.effects = o.effects.filter((x) => {
      if (toRemove > 0 && x.itemId === item.id) {
        toRemove--;
        return false;
      }
      return true;
    });
  }
  return o;
}

/**
 * Eigene Werte. Live: beobachtete Werte (inkl. Runen und Items) als Basis –
 * Item-Effekte werden aus dem Inventar ergänzt. Simulation: aus Basiswerten +
 * Items abgeleitet (Runen unbekannt → als Hinweis vermerkt).
 */
export function computeOwnStats(
  input: EngineInput,
  profile: ChampionProfile,
  items: Map<number, ItemDef>,
  rules: CombatRules,
): OwnStats {
  const ranks = abilityRanks(profile, input.me.level, input.me.abilityRanks);
  let s = emptyStats(profile, input.me.level, rules, ranks);
  const obs = input.me.observedStats;
  const known = input.me.items.map((id) => items.get(id)).filter((x): x is ItemDef => !!x);
  const unknown = input.me.items.filter((id) => !items.has(id));
  if (obs && obs.ad !== undefined) {
    s = {
      ...s,
      ad: obs.ad ?? s.ad,
      ap: obs.ap ?? 0,
      asTotal: obs.attackSpeedTotal ?? s.asTotal,
      crit: obs.crit ?? 0,
      critDamage: obs.critDamageTotal ?? s.critDamage,
      hp: obs.hp ?? s.hp,
      armor: obs.armor ?? s.armor,
      mr: obs.mr ?? s.mr,
      mana: obs.mana ?? s.mana,
      ah: obs.ah ?? 0,
      lethality: obs.lethality ?? 0,
      armorPenPct: obs.armorPenPct ?? s.armorPenPct,
      magicPenFlat: obs.magicPenFlat ?? 0,
      magicPenPct: obs.magicPenPct ?? 0,
      lifesteal: obs.lifesteal ?? 0,
      tenacity: obs.tenacity ?? 0,
      kind: 'observed',
    };
    for (const it of known) {
      for (const effect of it.effects ?? []) s.effects.push({ itemId: it.id, effect });
      s.itemIds.push(it.id);
      for (const e of it.effects ?? []) if (e.type === 'apAmp') s.apAmp += e.value;
    }
  } else {
    for (const it of known) s = applyItem(s, it, 1);
    s.notes.push('Eigene Werte aus Basiswerten + Items abgeleitet; Runen/Shards unbekannt.');
  }
  if (unknown.length) s.notes.push(`Unbekannte eigene Items ohne Modell: ${unknown.join(', ')}`);
  return s;
}
