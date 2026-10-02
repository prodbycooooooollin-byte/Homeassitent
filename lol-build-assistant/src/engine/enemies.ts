import { statAtLevel } from '../patch/patchData';
import type {
  ChampionKnowledge, ChampionProfile, CombatRules, GrowthStats, ItemDef, PlaystyleDef, TargetFocus,
} from '../shared/types';
import { clamp, combinePct } from './combat';
import type { EngineChampion, EngineInput } from './input';

export interface Range { value: number; low: number; high: number }

export interface ChampionEstimate {
  champ: EngineChampion;
  knowledge: ChampionKnowledge | null;
  level: number;
  hp: Range;
  armor: Range;
  mr: Range;
  itemHp: number;
  itemArmor: number;
  itemMr: number;
  /** Erwarteter Schild pro Kampf (LP). */
  shield: number;
  shieldSources: string[];
  /** Erwartete Heilung in LP/s während eines Kampfes. */
  healPerSec: number;
  healSources: string[];
  /** Effekte, die meinen Schaden direkt verändern. */
  critReduction: number;
  aaReduction: number;
  dmgMix: { physical: number; magic: number; true: number };
  enemyArmorPen: number;
  enemyLethality: number;
  enemyMagicPen: number;
  enemyMagicPenFlat: number;
  critUser: number;
  hasAntiheal: 'damage' | 'hit-taken' | null;
  itemGold: number;
  offensiveGold: number;
  unknownItems: number[];
  leadFactor: number;
  leadNotes: string[];
  uncertainty: string[];
  /** Relevanz als mein Schadensziel (normiert, Summe 1 über Gegner). */
  targetWeight: number;
  /** Gefährlichkeit für mich (0..~2, 1 ≈ durchschnittlich). */
  threat: number;
  threatNotes: string[];
}

const DEFAULT_KNOWLEDGE: Omit<ChampionKnowledge, 'key' | 'name'> = {
  cls: 'skirmisher', line: 0.5, ranged: false, dmg: { physical: 0.5, magic: 0.5, true: 0 },
  autoShare: 0.3, burst: 0.5, dive: 0.5, heal: 1, shield: 0, cc: [],
};

const CLASS_DAMAGE: Record<string, number> = {
  assassin: 1.0, marksman: 0.95, burstMage: 0.95, battleMage: 0.85, artillery: 0.85, skirmisher: 0.9,
  diver: 0.8, juggernaut: 0.8, specialist: 0.8, tank: 0.35, catcher: 0.4, enchanter: 0.25,
};
const CLASS_CARRY: Record<string, number> = {
  assassin: 0.9, marksman: 1.0, burstMage: 0.9, battleMage: 0.85, artillery: 0.85, skirmisher: 0.9,
  diver: 0.8, juggernaut: 0.8, specialist: 0.8, tank: 0.65, catcher: 0.55, enchanter: 0.6,
};
const HEAL_PCT_PER_SEC = [0, 0.004, 0.01, 0.02];
const SHIELD_PCT = [0, 0.03, 0.07, 0.12];
const OFFENSIVE_TAGS_AD = ['ad', 'lethality', 'crit', 'marksman', 'onhit', 'fighter'];
const OFFENSIVE_TAGS_AP = ['ap', 'ap-burst'];

export interface EnemyContext {
  items: Map<number, ItemDef>;
  championStats: Map<string, GrowthStats>;
  knowledge: Map<string, ChampionKnowledge>;
  rules: CombatRules;
}

export function estimateChampion(champ: EngineChampion, ctx: EnemyContext): Omit<ChampionEstimate, 'targetWeight' | 'threat' | 'threatNotes' | 'leadFactor' | 'leadNotes'> {
  const knowledge = ctx.knowledge.get(champ.championKey) ?? null;
  const k = knowledge ?? { key: champ.championKey, name: champ.championName, ...DEFAULT_KNOWLEDGE };
  const base = ctx.championStats.get(champ.championKey);
  const uncertainty: string[] = [];
  if (!knowledge) uncertainty.push(`${champ.championName}: kein Championwissen – Klasse/Schadensprofil geschätzt.`);
  if (!base) uncertainty.push(`${champ.championName}: keine Basiswerte – Klassen-Durchschnitt verwendet.`);
  const b: GrowthStats = base ?? { hp: 630, hpg: 105, ar: 32, arg: 4.7, mr: 31, mrg: 1.7 };
  const lvl = champ.level;
  let hp = statAtLevel(b.hp, b.hpg, lvl, ctx.rules);
  let armor = statAtLevel(b.ar, b.arg, lvl, ctx.rules);
  let mr = statAtLevel(b.mr, b.mrg, lvl, ctx.rules);

  let itemHp = 0, itemArmor = 0, itemMr = 0, itemGold = 0, offensiveGold = 0;
  let adGold = 0, apGold = 0;
  let shield = 0; const shieldSources: string[] = [];
  let lifesteal = 0; let healAmp = 0; const healSources: string[] = [];
  let critReduction = 0, aaReduction = 0, critUser = 0;
  let enemyArmorPen = 0, enemyLethality = 0, enemyMagicPen = 0, enemyMagicPenFlat = 0;
  let resistHighBandPct = 0;
  let hasAntiheal: ChampionEstimate['hasAntiheal'] = null;
  const unknownItems: number[] = [];

  if (!champ.itemsKnown) uncertainty.push(`${champ.championName}: Inventar unbekannt – nur Level-Basiswerte.`);
  for (const id of champ.items) {
    const it = ctx.items.get(id);
    if (!it) { unknownItems.push(id); continue; }
    const s = it.stats;
    itemHp += s.hp ?? 0; itemArmor += s.armor ?? 0; itemMr += s.mr ?? 0;
    itemGold += it.cost;
    lifesteal += (s.lifesteal ?? 0) + (s.omnivamp ?? 0);
    if (s.crit) critUser += s.crit;
    if (s.armorPenPct) enemyArmorPen = combinePct(enemyArmorPen, s.armorPenPct);
    enemyLethality += s.lethality ?? 0;
    if (s.magicPenPct) enemyMagicPen = combinePct(enemyMagicPen, s.magicPenPct);
    enemyMagicPenFlat += s.magicPenFlat ?? 0;
    const isAd = it.tags.some((t) => OFFENSIVE_TAGS_AD.includes(t)) && ((s.ad ?? 0) > 0 || (s.as ?? 0) > 0 || (s.crit ?? 0) > 0);
    const isAp = it.tags.some((t) => OFFENSIVE_TAGS_AP.includes(t)) && (s.ap ?? 0) > 0;
    if (isAd) { adGold += it.cost; offensiveGold += it.cost; }
    if (isAp) { apGold += it.cost; offensiveGold += it.cost; }
    for (const e of it.effects ?? []) {
      switch (e.type) {
        case 'lifeline': shield += e.shield * 0.8; shieldSources.push(it.name); break;
        case 'critDamageReduction': critReduction = Math.max(critReduction, e.value); break;
        case 'aaDamageReduction': aaReduction = Math.max(aaReduction, e.value); break;
        case 'healAmp': healAmp += e.value; break;
        case 'bonusResistInFight': resistHighBandPct = Math.max(resistHighBandPct, e.pct); break;
        case 'grievousWounds': hasAntiheal = hasAntiheal === 'damage' ? 'damage' : e.application; break;
        case 'revive': uncertainty.push(`${champ.championName}: Wiederbelebung (${it.name}) nicht als LP modelliert.`); break;
        case 'stasis': uncertainty.push(`${champ.championName}: Stasis (${it.name}) kann Burst verhindern.`); break;
        default: break;
      }
    }
  }
  hp += itemHp; armor += itemArmor; mr += itemMr;
  if (unknownItems.length) uncertainty.push(`${champ.championName}: ${unknownItems.length} unbekannte Items (IDs ${unknownItems.join(', ')}) nicht bewertet.`);

  // Unsicherheitsbänder: Runen (z. B. Conditioning, Überwucherung), Stapel-Items, Kit-Passive.
  const bonusArmor = itemArmor, bonusMr = itemMr;
  const armorRange: Range = { value: armor, low: armor, high: armor + 10 + bonusArmor * resistHighBandPct };
  const mrRange: Range = { value: mr, low: mr, high: mr + 10 + bonusMr * resistHighBandPct };
  const hpRange: Range = { value: hp, low: hp, high: hp + 10 * lvl + 0.035 * hp };
  if (k.resistUncertainty || knowledge?.notes) {
    armorRange.high += 15; mrRange.high += 10;
    if (knowledge?.notes) uncertainty.push(`${champ.championName}: ${knowledge.notes}`);
  }

  shield += SHIELD_PCT[k.shield] * hp;
  if (k.shield > 0) shieldSources.push('Kit');
  const estDps = 60 + 12 * lvl + offensiveGold / 40;
  let healPerSec = HEAL_PCT_PER_SEC[k.heal] * hp + lifesteal * estDps * k.autoShare + lifesteal * estDps * 0.3 * (1 - k.autoShare);
  if (k.heal > 0) healSources.push('Kit');
  if (lifesteal > 0) healSources.push(`Lebensraub/Omnivamp ${(lifesteal * 100).toFixed(0)} %`);
  healPerSec *= 1 + healAmp;
  if (healAmp > 0) healSources.push(`Heilverstärkung +${Math.round(healAmp * 100)} %`);

  // Schadensmischung: Kit-Profil, verschoben durch sichtbare Offensivitems.
  const kitMix = k.dmg;
  let dmgMix = { ...kitMix };
  if (adGold + apGold > 0) {
    const w = (adGold + apGold) / (adGold + apGold + 2500) * 0.6;
    const itemMix = { physical: adGold / (adGold + apGold), magic: apGold / (adGold + apGold), true: 0 };
    dmgMix = {
      physical: kitMix.physical * (1 - w) + itemMix.physical * w,
      magic: kitMix.magic * (1 - w) + itemMix.magic * w,
      true: kitMix.true * (1 - w),
    };
    const sum = dmgMix.physical + dmgMix.magic + dmgMix.true;
    dmgMix = { physical: dmgMix.physical / sum, magic: dmgMix.magic / sum, true: dmgMix.true / sum };
  }

  return {
    champ, knowledge, level: lvl, hp: hpRange, armor: armorRange, mr: mrRange,
    itemHp, itemArmor, itemMr, shield, shieldSources, healPerSec, healSources,
    critReduction, aaReduction, dmgMix, enemyArmorPen, enemyLethality, enemyMagicPen, enemyMagicPenFlat,
    critUser: clamp(critUser, 0, 1), hasAntiheal, itemGold, offensiveGold, unknownItems, uncertainty,
  };
}

/** Vorsprung aus verfügbaren Indikatoren. Kills allein sind nur schwach gewichtet. */
function leadFactor(e: ReturnType<typeof estimateChampion>, all: ReturnType<typeof estimateChampion>[]): { value: number; notes: string[] } {
  const notes: string[] = [];
  const avgLevel = all.reduce((s, x) => s + x.level, 0) / all.length;
  const known = all.filter((x) => x.champ.itemsKnown);
  const avgGold = known.length ? known.reduce((s, x) => s + x.itemGold, 0) / known.length : 0;
  let f = 1 + 0.06 * (e.level - avgLevel);
  if (Math.abs(e.level - avgLevel) >= 1) notes.push(`Level ${e.level} (Schnitt ${avgLevel.toFixed(1)})`);
  if (e.champ.itemsKnown && avgGold > 500) {
    const ratio = e.itemGold / avgGold;
    f += 0.35 * (ratio - 1);
    if (Math.abs(ratio - 1) > 0.15) notes.push(`Itemwert ${Math.round(e.itemGold)} g (${ratio > 1 ? '+' : ''}${Math.round((ratio - 1) * 100)} % ggü. Schnitt)`);
  }
  f += clamp(0.02 * (e.champ.scores.kills - e.champ.scores.deaths), -0.1, 0.1);
  return { value: clamp(f, 0.6, 1.6), notes };
}

/** Erwarteter Offensivitem-Wert eines Carrys zur Spielzeit (Kalibrierungsannahme). */
export function expectedOffensiveGold(gameTime: number): number {
  return Math.min(15000, Math.max(1500, (gameTime - 90) * 4.5));
}

export interface TargetModelOptions {
  playstyle: PlaystyleDef;
  focus: TargetFocus;
  myLine: number;
  myRanged: boolean;
}

export function assessEnemies(input: EngineInput, ctx: EnemyContext, opts: TargetModelOptions): ChampionEstimate[] {
  const base = input.enemies.map((e) => estimateChampion(e, ctx));
  const allEst = [...base, ...input.allies.map((a) => estimateChampion(a, ctx))];
  const out: ChampionEstimate[] = base.map((e) => {
    const lead = leadFactor(e, allEst);
    const k = e.knowledge ?? { ...DEFAULT_KNOWLEDGE };
    // --- Zielrelevanz -------------------------------------------------------
    const access = opts.playstyle.targetAccess.frontline * k.line + opts.playstyle.targetAccess.backline * (1 - k.line);
    const focusMult = opts.focus === 'frontline' ? 0.35 + 1.3 * k.line : opts.focus === 'backline' ? 0.35 + 1.3 * (1 - k.line) : 1;
    const priority = (CLASS_CARRY[k.cls] ?? 0.8) * (0.7 + 0.3 * lead.value);
    const rawTarget = access * focusMult * priority;
    // --- Bedrohung für mich --------------------------------------------------
    // Offensivitems relativ zum erwarteten Stand zu dieser Spielzeit (Annahme: ~4,5 g/s in Offensive).
    const ratio = clamp(e.offensiveGold / expectedOffensiveGold(input.gameTime), 0.3, 3);
    const dmgPotential = (CLASS_DAMAGE[k.cls] ?? 0.8) * (0.6 + 0.4 * ratio);
    const reach = opts.myLine < 0.5 ? 0.35 + 0.65 * k.dive : 0.75 + 0.25 * k.dive;
    // Bedrohung: Offensivitems (dmgPotential), Level und – schwach – Kills.
    // Defensivgold erhöht die Bedrohung nicht (Tank kauft Rüstung ≠ gefährlicher für mich).
    const avgLevel = base.reduce((s, x) => s + x.level, 0) / Math.max(1, base.length);
    const threatLead = clamp(1 + 0.06 * (e.level - avgLevel) + clamp(0.03 * (e.champ.scores.kills - e.champ.scores.deaths), -0.15, 0.2), 0.6, 1.6);
    const threat = dmgPotential * reach * threatLead;
    const threatNotes: string[] = [];
    if (e.offensiveGold > 0) threatNotes.push(`Offensivitems ${Math.round(e.offensiveGold)} g`);
    if (e.champ.scores.kills - e.champ.scores.deaths >= 3) threatNotes.push(`${e.champ.scores.kills}/${e.champ.scores.deaths} K/D (schwach gewichtet)`);
    if (opts.myLine < 0.5 && k.dive > 0.6) threatNotes.push('erreicht die Backline');
    return { ...e, leadFactor: lead.value, leadNotes: lead.notes, targetWeight: rawTarget, threat, threatNotes };
  });
  const sum = out.reduce((s, x) => s + x.targetWeight, 0) || 1;
  for (const e of out) e.targetWeight /= sum;
  return out;
}

export function assessAllies(input: EngineInput, ctx: EnemyContext): ChampionEstimate[] {
  return input.allies.map((a) => ({
    ...estimateChampion(a, ctx), leadFactor: 1, leadNotes: [], targetWeight: 0, threat: 0, threatNotes: [],
  }));
}

export function myLine(profile: ChampionProfile, knowledge: Map<string, ChampionKnowledge>): number {
  return knowledge.get(profile.key)?.line ?? (profile.ranged ? 0.1 : 0.6);
}
