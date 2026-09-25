import type { LoadedData } from '../patch/patchData';
import { itemDisplayName } from '../patch/patchData';
import type {
  AdvisorSettings, ChampionProfile, DamageType, ItemDef, ItemEffect, PlaystyleDef, TargetFocus,
} from '../shared/types';
import { clamp } from './combat';
import { simulateScenario } from './damage';
import {
  type Candidate, type Exclusion, generateCandidates, isBoots, missingComponents, resolveCost,
} from './candidates';
import { assessAllies, assessEnemies, type ChampionEstimate, myLine as lineOf } from './enemies';
import {
  adaptiveWeights, type Band, type BuildValue, combine, type EvalContext, evaluateBuild, type Gains, gainsBetween,
} from './evaluator';
import type { EngineInput } from './input';
import { abilityRanks, applyItem, computeOwnStats, type OwnStats } from './ownStats';
import { buildThreatProfile, teamAntihealCoverage, type ThreatProfile } from './threat';

export type DriverKind = 'pen' | 'hpPct' | 'antiheal' | 'raw' | 'defense' | 'utility';

export interface Driver {
  kind: DriverKind;
  /** Beitrag zum kombinierten Wert (gleiche Einheit wie `value`). */
  contribution: number;
}

export interface OptionEval {
  itemId: number;
  name: string;
  remaining: number;
  consumed: number[];
  etaSec: number;
  gains: Gains;
  value: number;
  confidence: number;
  adjValue: number;
  pathScore: number;
  followUp: number | null;
  drivers: Driver[];
  needsSell: boolean;
  coverage: ItemDef['coverage'];
  unmodeled: string[];
}

export interface ComponentPlan {
  targetId: number;
  mode: 'complete' | 'components' | 'save';
  buy: { itemId: number; name: string; cost: number }[];
  spend: number;
  remainingAfter: number;
  etaCompleteSec: number;
  reason: string;
}

export interface VariantOutcome {
  label: string;
  bestItem: number;
  bestName: string;
}

export interface CounterCheck {
  category: 'armor' | 'mr' | 'heal' | 'hp';
  trigger: string;
  itemId: number;
  name: string;
  status: 'favorite' | 'alternative' | 'candidate' | 'excluded' | 'not-in-pool';
  reason: string;
  scoreVsFavorite?: number;
  winsUnder: string[];
}

export interface EnemyView {
  id: string;
  name: string;
  championKey: string;
  level: number;
  targetWeight: number;
  threat: number;
  armor: { value: number; low: number; high: number };
  mr: { value: number; low: number; high: number };
  hp: { value: number; low: number; high: number };
  itemArmor: number;
  itemMr: number;
  itemHp: number;
  healPerSec: number;
  shield: number;
  items: number[];
  itemsKnown: boolean;
  itemsSource: string;
  itemsAgeSec: number | null;
  unknownItems: number[];
  leadFactor: number;
  notes: string[];
}

export interface EvaluationResult {
  ok: true;
  generatedAtGameTime: number;
  championKey: string;
  championName: string;
  supportLevel: ChampionProfile['supportLevel'];
  playstyle: { id: string; name: string };
  role: string | null;
  focus: TargetFocus;
  weights: { offense: number; defense: number; utility: number };
  threat: ThreatProfile;
  myDamageMix: Record<DamageType, number>;
  current: BuildValue;
  options: OptionEval[];
  ranking: number[];
  /** Angezeigter Favorit (ggf. durch Hysterese/Fixierung gehalten). */
  bestId: number | null;
  /** Bestes Item laut aktueller Rechnung (inkl. Fixierung), ohne Hysterese. */
  modelBestId: number | null;
  alternatives: { itemId: number; advantage: string }[];
  components: ComponentPlan | null;
  preview: number[];
  exclusions: Exclusion[];
  counters: CounterCheck[];
  variants: VariantOutcome[];
  robust: { robust: boolean; note: string } | null;
  sellException: { sellId: number; buyId: number; gain: number; netCost: number } | null;
  /** Vorläufige Gegenmaßnahme als Komponente (z. B. Antiheal), statt sofort ein ganzes Item. */
  interimCounters: { itemId: number; name: string; cost: number; value: number; delaySec: number; reason: string }[];
  enemies: EnemyView[];
  warnings: string[];
  assumptions: string[];
  confidence: number;
  input: EngineInput;
}

export interface UnsupportedResult {
  ok: false;
  reason: 'unsupported-champion' | 'no-player' | 'strict-patch';
  message: string;
  championKey?: string;
}

export type EngineResult = EvaluationResult | UnsupportedResult;

interface Prepared {
  profile: ChampionProfile;
  playstyle: PlaystyleDef;
  own: OwnStats;
  ctx: EvalContext;
  items: Map<number, ItemDef>;
  current: BuildValue;
  weights: { offense: number; defense: number; utility: number };
  enemies: ChampionEstimate[];
  allies: ChampionEstimate[];
}

export function choosePlaystyle(profile: ChampionProfile, role: string | null, override: string | null): PlaystyleDef {
  if (override) {
    const p = profile.playstyles.find((x) => x.id === override);
    if (p) return p;
  }
  const byRole = role ? profile.defaultPlaystyle[role as keyof ChampionProfile['defaultPlaystyle']] : undefined;
  return profile.playstyles.find((x) => x.id === byRole) ?? profile.playstyles[0];
}

function prepare(input: EngineInput, data: LoadedData, settings: AdvisorSettings, focusOverride?: TargetFocus): Prepared | UnsupportedResult {
  const profile = data.profiles.get(input.me.championKey);
  if (!profile) {
    return {
      ok: false, reason: 'unsupported-champion', championKey: input.me.championKey,
      message: `${input.me.championName} hat noch kein Championprofil. Es werden bewusst keine generischen Empfehlungen angezeigt.`,
    };
  }
  const playstyle = choosePlaystyle(profile, input.me.role, settings.playstyleOverride);
  const items = data.patch.items;
  const enemyCtx = { items, championStats: data.patch.championStats, knowledge: data.knowledge, rules: data.patch.rules };
  const line = lineOf(profile, data.knowledge);
  const enemies = assessEnemies(input, enemyCtx, {
    playstyle, focus: focusOverride ?? settings.targetFocus, myLine: line, myRanged: profile.ranged,
  });
  const allies = assessAllies(input, enemyCtx);
  const threat = buildThreatProfile(enemies, data.patch.rules, input.gameTime);
  const teamAntiheal = new Map<string, number>();
  let uncovered = 0;
  for (const e of enemies) {
    const cov = teamAntihealCoverage(e, allies).coverage;
    teamAntiheal.set(e.champ.id, cov);
    uncovered += clamp(e.healPerSec / Math.max(1, e.hp.value) / 0.02, 0, 1) * (1 - cov) / Math.max(1, enemies.length);
  }
  const allyPhys = allies.length
    ? allies.reduce((s, a) => s + a.dmgMix.physical, 0) / allies.length : 0.5;
  const ranks = abilityRanks(profile, input.me.level, input.me.abilityRanks);
  const ctx: EvalContext = {
    profile, playstyle, ranks, enemies, allies, threat, rules: data.patch.rules, teamAntiheal,
    allyPhysicalShare: allyPhys, uncoveredHealing: clamp(uncovered * 2, 0, 1), myLine: line,
  };
  const own = computeOwnStats(input, profile, items, data.patch.rules);
  const current = evaluateBuild(own, ctx);
  const weights = adaptiveWeights(playstyle, threat.index);
  return { profile, playstyle, own, ctx, items, current, weights, enemies, allies };
}

function withPurchase(own: OwnStats, add: ItemDef, consumed: number[], items: Map<number, ItemDef>): OwnStats {
  let s = own;
  for (const c of consumed) { const it = items.get(c); if (it) s = applyItem(s, it, -1); }
  return applyItem(s, add, 1);
}

// Stat-Gruppen für die Treiberanalyse (Leave-one-out je Gruppe).
const PEN_STATS = ['armorPenPct', 'lethality', 'magicPenPct', 'magicPenFlat'] as const;
const PEN_EFFECTS = new Set<ItemEffect['type']>(['armorShredStacking', 'penRampInFight', 'shieldReaver']);
const HP_EFFECTS = new Set<ItemEffect['type']>(['onHitCurrentHp', 'burnMaxHp', 'maxHpBurst', 'everyNthHit', 'selfMaxHpOnHit']);

function stripItem(it: ItemDef, kind: 'pen' | 'hpPct' | 'antiheal'): ItemDef {
  const stats = { ...it.stats };
  let effects = it.effects ?? [];
  if (kind === 'pen') { for (const k of PEN_STATS) delete stats[k]; effects = effects.filter((e) => !PEN_EFFECTS.has(e.type)); }
  if (kind === 'hpPct') effects = effects.filter((e) => !HP_EFFECTS.has(e.type));
  if (kind === 'antiheal') effects = effects.filter((e) => e.type !== 'grievousWounds');
  return { ...it, stats, effects };
}

function patchFactor(input: EngineInput): number {
  switch (input.patchStatus.level) {
    case 'validated': return 1;
    case 'unvalidated': return 0.85;
    default: return 0.75;
  }
}

function coverageFactor(it: ItemDef): number {
  return it.coverage === 'full' ? 1 : it.coverage === 'partial' ? 0.85 : 0.7;
}

function enemyDataQuality(enemies: ChampionEstimate[]): number {
  let q = 0;
  for (const e of enemies) q += e.targetWeight * (e.champ.itemsKnown ? 1 : 0.5) * (e.knowledge ? 1 : 0.7);
  return q;
}

interface Scored {
  option: OptionEval;
  after: OwnStats;
  cand: Candidate;
}

function scoreCandidates(p: Prepared, input: EngineInput, cands: Candidate[], settings: AdvisorSettings, band: Band = 'value', fixedHorizon?: number): Scored[] {
  const rate = Math.max(0.5, input.goldRate.value);
  // Horizont: mindestens die Einstellung, sonst bis ~zwei weitere fertige Items.
  const H = fixedHorizon ?? Math.max(settings.horizonSec, (6000 - input.me.gold) / rate + 60);
  const q = enemyDataQuality(p.enemies);
  const champF = p.profile.supportLevel === 'supported' ? 1 : 0.85;
  const current = band === 'value' ? p.current : evaluateBuild(p.own, p.ctx, band);
  const firstPass: Scored[] = cands.map((c) => {
    const after = withPurchase(p.own, c.item, c.consumed, p.items);
    const v = evaluateBuild(after, p.ctx, band);
    const gains = gainsBetween(current, v);
    const value = combine(gains, p.weights);
    const confidence = patchFactor(input) * coverageFactor(c.item) * (0.6 + 0.4 * q) * champF;
    const adjValue = value * (0.85 + 0.15 * confidence);
    const eta = Math.max(0, c.remaining - input.me.gold) / rate;
    return {
      after, cand: c,
      option: {
        itemId: c.item.id, name: itemDisplayName(c.item), remaining: c.remaining, consumed: c.consumed,
        etaSec: eta, gains, value, confidence, adjValue, pathScore: 0, followUp: null, drivers: [],
        needsSell: false,
        coverage: c.item.coverage, unmodeled: c.item.unmodeled ?? [],
      },
    };
  });
  // Einkaufsweg mit begrenztem Ausblick: X jetzt, danach bester Folgekauf Y.
  for (const s of firstPass) {
    const tX = s.option.etaSec;
    let pathValue = Math.max(0, H - tX) * s.option.adjValue;
    const owned2 = [...input.me.items];
    for (const c of s.option.consumed) { const i = owned2.indexOf(c); if (i >= 0) owned2.splice(i, 1); }
    owned2.push(s.option.itemId);
    const next = generateCandidates(owned2, p.profile, p.playstyle, p.items, { mapNumber: input.mapNumber, slots: 6 });
    let best = 0; let bestId: number | null = null;
    for (const c2 of next.candidates) {
      if (c2.slotsAfter > 6) continue;
      const after2 = withPurchase(s.after, c2.item, c2.consumed, p.items);
      const v2 = combine(gainsBetween(current, evaluateBuild(after2, p.ctx, band)), p.weights) * (0.85 + 0.15 * s.option.confidence);
      const tXY = tX + c2.remaining / rate;
      const inc = Math.max(0, v2 - s.option.adjValue) * Math.max(0, H - tXY);
      if (inc > best) { best = inc; bestId = c2.item.id; }
    }
    pathValue += best;
    s.option.pathScore = pathValue / H;
    s.option.followUp = bestId;
  }
  return firstPass.sort((a, b) => b.option.pathScore - a.option.pathScore || a.option.itemId - b.option.itemId);
}

function computeDrivers(p: Prepared, s: Scored): Driver[] {
  const out: Driver[] = [];
  const it = s.cand.item;
  const base = s.option.value;
  for (const kind of ['pen', 'hpPct', 'antiheal'] as const) {
    const stripped = stripItem(it, kind);
    if (JSON.stringify(stripped) === JSON.stringify(it)) continue;
    const after = withPurchase(p.own, stripped, s.cand.consumed, p.items);
    const v = combine(gainsBetween(p.current, evaluateBuild(after, p.ctx)), p.weights);
    const contribution = base - v;
    if (Math.abs(contribution) > 1e-4) out.push({ kind, contribution });
  }
  const special = out.reduce((a, d) => a + d.contribution, 0);
  out.push({ kind: 'raw', contribution: p.weights.offense * s.option.gains.offense - special });
  out.push({ kind: 'defense', contribution: p.weights.defense * s.option.gains.defense });
  out.push({ kind: 'utility', contribution: p.weights.utility * s.option.gains.utility });
  return out.sort((a, b) => b.contribution - a.contribution);
}

function myDamageMix(p: Prepared): Record<DamageType, number> {
  const acc: Record<DamageType, number> = { physical: 0, magic: 0, true: 0 };
  for (const e of p.enemies) {
    for (const sc of p.playstyle.scenarios) {
      const r = simulateScenario(p.own, sc, e, { profile: p.profile, ranks: p.ctx.ranks, antihealTeamCoverage: 0 });
      const w = e.targetWeight * sc.weight;
      acc.physical += w * r.byType.physical; acc.magic += w * r.byType.magic; acc.true += w * r.byType.true;
    }
  }
  const s = acc.physical + acc.magic + acc.true || 1;
  return { physical: acc.physical / s, magic: acc.magic / s, true: acc.true / s };
}

function componentPlan(p: Prepared, input: EngineInput, target: OptionEval): ComponentPlan {
  const gold = input.me.gold;
  const rate = Math.max(0.5, input.goldRate.value);
  const name = target.name;
  if (gold >= target.remaining) {
    return {
      targetId: target.itemId, mode: 'complete', buy: [{ itemId: target.itemId, name, cost: target.remaining }],
      spend: target.remaining, remainingAfter: 0, etaCompleteSec: 0, reason: `${name} ist jetzt vollständig bezahlbar.`,
    };
  }
  const nodes = missingComponents(target.itemId, input.me.items, p.items).slice(0, 10);
  const freeSlots = 6 - input.me.items.length;
  let best: { set: number[]; value: number; cost: number } = { set: [], value: 0, cost: 0 };
  const n = nodes.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const set: number[] = [];
    let cost = 0; let ok = true;
    for (let i = 0; i < n && ok; i++) {
      if (!(mask & (1 << i))) continue;
      // kein Knoten zusammen mit seinem Vorfahren
      let par = nodes[i].parent;
      while (par !== null) {
        const pi = nodes.findIndex((x) => x.itemId === par);
        if (pi >= 0 && mask & (1 << pi)) { ok = false; break; }
        par = pi >= 0 ? nodes[pi].parent : null;
      }
      set.push(i); cost += nodes[i].remaining;
    }
    if (!ok || cost > gold || set.length > Math.max(0, freeSlots) + 0) continue;
    let s = p.own;
    for (const i of set) {
      const it = p.items.get(nodes[i].itemId);
      if (!it) continue;
      const res = resolveCost(it.id, input.me.items, p.items);
      s = withPurchase(s, it, res.consumed, p.items);
    }
    const v = combine(gainsBetween(p.current, evaluateBuild(s, p.ctx)), p.weights);
    if (v > best.value + 1e-9 || (Math.abs(v - best.value) < 1e-9 && cost < best.cost)) best = { set: set.map((i) => nodes[i].itemId), value: v, cost };
  }
  const etaComplete = Math.max(0, target.remaining - gold) / rate;
  if (!best.set.length) {
    const cheapest = nodes.reduce((m, x) => (x.remaining < m ? x.remaining : m), Infinity);
    const missing = Math.max(0, cheapest - gold);
    const slotNote = freeSlots <= 0 ? ' Kein freier Inventarplatz für eine Komponente.' : '';
    return {
      targetId: target.itemId, mode: 'save', buy: [], spend: 0, remainingAfter: target.remaining,
      etaCompleteSec: etaComplete,
      reason: Number.isFinite(cheapest)
        ? `Gold sparen: Für die günstigste fehlende Komponente fehlen ${Math.round(missing)} g (ca. ${Math.round(missing / rate)} s).${slotNote}`
        : `Gold sparen bis ${name} (${Math.round(target.remaining)} g).${slotNote}`,
    };
  }
  const buy = best.set.map((id) => {
    const node = nodes.find((x) => x.itemId === id)!;
    return { itemId: id, name: itemDisplayName(p.items.get(id), id), cost: node.remaining };
  });
  return {
    targetId: target.itemId, mode: 'components', buy, spend: best.cost,
    remainingAfter: target.remaining - best.cost, etaCompleteSec: etaComplete,
    reason: `Mit ${Math.round(gold)} g: ${buy.map((b) => b.name).join(' + ')}; danach fehlen ${Math.round(target.remaining - best.cost)} g bis ${name}.`,
  };
}

function buildPreview(p: Prepared, input: EngineInput, firstId: number): number[] {
  const seq: number[] = [firstId];
  let owned = [...input.me.items];
  let own = p.own;
  const first = p.items.get(firstId);
  if (!first) return seq;
  const r0 = resolveCost(firstId, owned, p.items);
  own = withPurchase(own, first, r0.consumed, p.items);
  for (const c of r0.consumed) { const i = owned.indexOf(c); if (i >= 0) owned.splice(i, 1); }
  owned.push(firstId);
  const completed = (ids: number[]) => ids.filter((id) => { const t = p.items.get(id)?.tier; return t === 'legendary' || t === 'boots'; }).length;
  let guard = 0;
  while (completed(owned) < 6 && guard++ < 6) {
    const cs = generateCandidates(owned, p.profile, p.playstyle, p.items, { mapNumber: input.mapNumber, slots: 6 });
    const base = evaluateBuild(own, p.ctx);
    let best: { id: number; v: number; cons: number[]; after: OwnStats } | null = null;
    for (const c of cs.candidates) {
      const after = withPurchase(own, c.item, c.consumed, p.items);
      const v = combine(gainsBetween(base, evaluateBuild(after, p.ctx)), p.weights);
      if (!best || v > best.v) best = { id: c.item.id, v, cons: c.consumed, after };
    }
    if (!best || best.v <= 0) break;
    seq.push(best.id);
    own = best.after;
    for (const c of best.cons) { const i = owned.indexOf(c); if (i >= 0) owned.splice(i, 1); }
    // Nicht verbrauchte Komponenten zählen in der Vorschau nicht als Platz für fertige Items.
    owned = owned.filter((id) => { const t = p.items.get(id)?.tier; return t === 'legendary' || t === 'boots'; });
    owned.push(best.id);
  }
  return seq;
}

function pickAlternatives(ranked: OptionEval[], bestId: number | null): { itemId: number; advantage: string }[] {
  const fav = ranked.find((o) => o.itemId === bestId);
  if (!fav) return [];
  const pool = ranked.filter((o) => o.itemId !== bestId).slice(0, 8);
  const out: { itemId: number; advantage: string }[] = [];
  const label = (o: OptionEval): string => {
    const adv: string[] = [];
    if (o.gains.offense > fav.gains.offense + 0.01) adv.push('mehr Schaden');
    if (o.gains.defense > fav.gains.defense + 0.01) adv.push('mehr Sicherheit');
    if (o.gains.utility > fav.gains.utility + 0.01) adv.push('mehr Utility');
    if (o.etaSec + 5 < fav.etaSec) adv.push('früher fertig');
    return adv.join(', ');
  };
  const minScore = fav.pathScore * 0.7;
  const want = ['mehr Schaden', 'mehr Sicherheit', 'früher fertig'];
  for (const w of want) {
    const o = pool.find((x) => x.pathScore >= minScore && label(x).includes(w) && !out.some((y) => y.itemId === x.itemId));
    if (o && out.length < 2) out.push({ itemId: o.itemId, advantage: label(o) });
  }
  for (const o of pool) {
    if (out.length >= 2) break;
    if (out.some((y) => y.itemId === o.itemId)) continue;
    out.push({ itemId: o.itemId, advantage: label(o) || 'knapp dahinter' });
  }
  return out;
}

function enemyViews(p: Prepared, input: EngineInput, now: number): EnemyView[] {
  return p.enemies.map((e) => ({
    id: e.champ.id, name: e.champ.championName, championKey: e.champ.championKey, level: e.level,
    targetWeight: e.targetWeight, threat: e.threat,
    armor: e.armor, mr: e.mr, hp: e.hp, itemArmor: e.itemArmor, itemMr: e.itemMr, itemHp: e.itemHp,
    healPerSec: e.healPerSec, shield: e.shield, items: e.champ.items, itemsKnown: e.champ.itemsKnown,
    itemsSource: e.champ.itemsProvenance.source,
    itemsAgeSec: e.champ.itemsProvenance.kind === 'unknown' ? null : Math.max(0, (now - e.champ.itemsProvenance.at) / 1000),
    unknownItems: e.unknownItems, leadFactor: e.leadFactor, notes: [...e.uncertainty],
  }));
}

function counterChecks(p: Prepared, data: LoadedData, ranked: OptionEval[], bestId: number | null, alts: number[], exclusions: Exclusion[], mix: Record<DamageType, number>, variantWinners: Map<number, string[]>): CounterCheck[] {
  const w = (f: (e: ChampionEstimate) => number) => p.enemies.reduce((s, e) => s + e.targetWeight * f(e), 0);
  const cats: { category: CounterCheck['category']; trigger: string; match: (it: ItemDef) => boolean }[] = [];
  const armorItems = w((e) => e.itemArmor);
  const mrItems = w((e) => e.itemMr);
  const hpAvg = w((e) => e.hp.value);
  const healer = [...p.enemies].sort((a, b) => b.healPerSec / b.hp.value - a.healPerSec / a.hp.value)[0];
  if (armorItems >= 35) cats.push({ category: 'armor', trigger: `Relevante Ziele haben im Schnitt +${Math.round(armorItems)} Rüstung aus Items`, match: (it) => !!(it.stats.armorPenPct || it.stats.lethality || it.effects?.some((e) => e.type === 'armorShredStacking')) });
  if (mrItems >= 35) cats.push({ category: 'mr', trigger: `Relevante Ziele haben im Schnitt +${Math.round(mrItems)} MR aus Items`, match: (it) => !!(it.stats.magicPenPct || it.stats.magicPenFlat) });
  if (healer && healer.healPerSec / healer.hp.value >= 0.007) cats.push({ category: 'heal', trigger: `${healer.champ.championName} heilt geschätzt ~${Math.round(healer.healPerSec)} LP/s`, match: (it) => !!it.effects?.some((e) => e.type === 'grievousWounds') });
  if (hpAvg >= 2600) cats.push({ category: 'hp', trigger: `Gewichtetes Ziel-Leben ~${Math.round(hpAvg)} LP`, match: (it) => !!it.effects?.some((e) => HP_EFFECTS.has(e.type)) });
  const out: CounterCheck[] = [];
  const fav = ranked.find((o) => o.itemId === bestId);
  for (const cat of cats) {
    const relevantType = cat.category === 'armor' ? 'physical' : cat.category === 'mr' ? 'magic' : null;
    for (const it of data.patch.items.values()) {
      if (it.tier !== 'legendary' || !cat.match(it)) continue;
      const opt = ranked.find((o) => o.itemId === it.id);
      const ex = exclusions.find((x) => x.itemId === it.id);
      let status: CounterCheck['status']; let reason: string;
      if (it.id === bestId) { status = 'favorite'; reason = 'Ist die aktuelle bevorzugte Option.'; }
      else if (alts.includes(it.id)) { status = 'alternative'; reason = 'Wird als Alternative angezeigt.'; }
      else if (opt && fav) {
        status = 'candidate';
        const d = fav.pathScore > 0 ? (opt.pathScore / fav.pathScore - 1) * 100 : 0;
        reason = `Modellwert ${d.toFixed(0)} % gegenüber ${fav.name}` + (opt.etaSec > fav.etaSec + 10 ? `; fertig erst in ~${Math.round(opt.etaSec)} s` : '');
      } else if (ex) { status = 'excluded'; reason = ex.reason; }
      else {
        status = 'not-in-pool';
        reason = relevantType
          ? `Nicht im Kandidatenpool von '${p.playstyle.name}': dein modellierter Schaden ist zu ${Math.round(mix[relevantType] * 100)} % ${relevantType === 'physical' ? 'physisch' : 'magisch'}.`
          : `Nicht im Kandidatenpool von '${p.playstyle.name}'.`;
      }
      if (status === 'not-in-pool') {
        // Eine zusammengefasste Zeile je Kategorie statt jedes einzelnen Items.
        if (out.some((o) => o.category === cat.category && o.status === 'not-in-pool')) continue;
        const typeShare = relevantType ? mix[relevantType] : 1;
        reason = relevantType && typeShare < 0.25
          ? `Dein modellierter Schaden ist nur zu ${Math.round(typeShare * 100)} % ${relevantType === 'physical' ? 'physisch' : 'magisch'} – diese Gegenmaßnahme wirkt kaum auf deinen Schaden.`
          : `Gehört zu einer Itemklasse (${it.tags.filter((t) => !['pen', 'antiheal', 'ad', 'ap', 'hp'].includes(t)).join('/') || it.tags.join('/')}), die nicht zur Spielweise '${p.playstyle.name}' passt; wird nicht ohne Spielweisenwechsel vorgeschlagen.`;
      }
      out.push({
        category: cat.category, trigger: cat.trigger, itemId: it.id, name: itemDisplayName(it), status, reason,
        scoreVsFavorite: opt && fav && fav.pathScore > 0 ? opt.pathScore / fav.pathScore - 1 : undefined,
        winsUnder: variantWinners.get(it.id) ?? [],
      });
    }
  }
  return out;
}

/**
 * Vorläufige Gegenmaßnahme: günstige Komponente mit Gegeneffekt (derzeit Antiheal),
 * wenn der Favorit selbst keinen hat. Wert und Verzögerung des Favoriten werden berechnet.
 */
function interimCounterOptions(p: Prepared, input: EngineInput, fav: OptionEval, mix: Record<DamageType, number>): EvaluationResult['interimCounters'] {
  const favItem = p.items.get(fav.itemId);
  if (favItem?.effects?.some((e) => e.type === 'grievousWounds')) return [];
  // Nur bei relevanter gegnerischer Heilung (gleiche Schwelle wie die Gegenmaßnahmen-Prüfung).
  const healer0 = [...p.enemies].sort((a, b) => b.healPerSec / b.hp.value - a.healPerSec / a.hp.value)[0];
  if (!healer0 || healer0.healPerSec / healer0.hp.value < 0.007) return [];
  if (input.me.items.some((id) => p.items.get(id)?.effects?.some((e) => e.type === 'grievousWounds'))) return [];
  const rate = Math.max(0.5, input.goldRate.value);
  const out: EvaluationResult['interimCounters'] = [];
  const physical = mix.physical >= mix.magic;
  for (const it of p.items.values()) {
    if (it.tier !== 'epic' || !it.effects?.some((e) => e.type === 'grievousWounds')) continue;
    const fits = p.playstyle.weights.defense >= 0.5 ? it.tags.includes('armor') : physical ? it.tags.includes('ad') : it.tags.includes('ap');
    if (!fits || it.cost > input.me.gold || input.me.items.length >= 6) continue;
    const after = applyItem(p.own, it, 1);
    const g = gainsBetween(p.current, evaluateBuild(after, p.ctx));
    const value = combine(g, p.weights);
    const antihealOnly = combine(gainsBetween(p.current, evaluateBuild(applyItem(p.own, stripItem(it, 'antiheal'), 1), p.ctx)), p.weights);
    const antiheal = value - antihealOnly;
    if (antiheal < 0.02) continue;
    const intoFav = resolveCost(fav.itemId, [...input.me.items, it.id], p.items).consumed.includes(it.id);
    const delay = intoFav ? 0 : it.cost / rate;
    const healer = [...p.enemies].sort((a, b) => b.healPerSec - a.healPerSec)[0];
    out.push({
      itemId: it.id, name: itemDisplayName(it), cost: it.cost, value, delaySec: delay,
      reason: `${itemDisplayName(it)} (${it.cost} g) als vorläufiges Antiheal gegen ${healer?.champ.championName ?? 'Heilung'} (~${Math.round(healer?.healPerSec ?? 0)} LP/s): Antiheal trägt ${(antiheal * 100).toFixed(1)} Prozentpunkte zum Modellwert bei` +
        (intoFav ? `; baut in ${fav.name} ein.` : `; verzögert ${fav.name} um ~${Math.round(delay)} s, wenn sie nicht ins Ziel-Item eingeht.`),
    });
  }
  return out.sort((a, b) => b.value - a.value).slice(0, 1);
}

export interface EvaluateOptions {
  /** Nur Rangfolge (für Attribution/Leave-one-out): ohne Varianten, Vorschau, Komponenten. */
  lite?: boolean;
  /** Von der Hysterese gehaltener Favorit: Komponenten, Vorschau und Alternativen beziehen sich darauf. */
  favorite?: number | null;
}

export function evaluate(input: EngineInput, data: LoadedData, settings: AdvisorSettings, now: number = Date.now(), opts: EvaluateOptions = {}): EngineResult {
  if (settings.strictPatch && input.patchStatus.restricted) {
    return { ok: false, reason: 'strict-patch', message: `Strikter Patchmodus: ${input.patchStatus.message}` };
  }
  const prep = prepare(input, data, settings);
  if ('ok' in prep) return prep;
  const p = prep;
  const forceInclude = settings.pinnedItem ? [settings.pinnedItem] : [];
  const cs = generateCandidates(input.me.items, p.profile, p.playstyle, p.items, { mapNumber: input.mapNumber, slots: 6, forceInclude });
  const usable = cs.candidates.filter((c) => c.slotsAfter <= 6);
  const blockedBySlots = cs.candidates.filter((c) => c.slotsAfter > 6);
  const scored = scoreCandidates(p, input, usable, settings);
  if (!opts.lite) for (const s of scored.slice(0, 8)) s.option.drivers = computeDrivers(p, s);
  const ranked = scored.map((s) => s.option);
  const warnings: string[] = [];
  const assumptions: string[] = [];
  let bestId = ranked[0]?.itemId ?? null;

  // Fixiertes Item: wird Favorit, Nachteil wird transparent gemacht.
  if (settings.pinnedItem) {
    const pinned = ranked.find((o) => o.itemId === settings.pinnedItem);
    if (pinned) bestId = pinned.itemId;
    else if (input.me.items.includes(settings.pinnedItem)) warnings.push('Das fixierte Item ist bereits gekauft – Fixierung kann aufgehoben werden.');
    else {
      const ex = cs.exclusions.find((x) => x.itemId === settings.pinnedItem);
      warnings.push(`Fixiertes Item nicht kaufbar: ${ex?.reason ?? 'kein Kandidat'}.`);
    }
  }
  const modelBestId = bestId;
  if (opts.favorite != null && ranked.some((o) => o.itemId === opts.favorite)) bestId = opts.favorite;
  const exclusions = [...cs.exclusions, ...blockedBySlots.map((c) => ({ itemId: c.item.id, reason: 'Kein freier Inventarplatz (nur mit Verkauf möglich)' }))];

  // Robustheit gegenüber den Schätzbändern der Gegnerresistenzen.
  let robust: EvaluationResult['robust'] = null;
  if (!opts.lite && ranked.length >= 2 && bestId !== null) {
    const topIds = new Set(ranked.slice(0, 3).map((o) => o.itemId));
    const sub = usable.filter((c) => topIds.has(c.item.id));
    const low = scoreCandidates(p, input, sub, settings, 'low')[0]?.option.itemId;
    const high = scoreCandidates(p, input, sub, settings, 'high')[0]?.option.itemId;
    const isRobust = low === modelBestId && high === modelBestId;
    robust = {
      robust: isRobust,
      note: isRobust
        ? 'Rangfolge bleibt über das Schätzband der Gegnerresistenzen/-leben stabil.'
        : `Rangfolge hängt von unsicheren Gegnerwerten ab (niedrige Schätzung: ${itemDisplayName(p.items.get(low!), low)}, hohe: ${itemDisplayName(p.items.get(high!), high)}).`,
    };
  }

  // Annahme-Varianten: gewinnt ein anderes Item unter anderer Zielannahme/Kampfdauer?
  const variants: VariantOutcome[] = [];
  const variantWinners = new Map<number, string[]>();
  const addVariant = (label: string, id: number | undefined) => {
    if (id === undefined) return;
    variants.push({ label, bestItem: id, bestName: itemDisplayName(p.items.get(id), id) });
    if (id !== bestId) variantWinners.set(id, [...(variantWinners.get(id) ?? []), label]);
  };
  const focusLabels: Record<TargetFocus, string> = { frontline: 'Fokus Frontline', backline: 'Fokus Backline', balanced: 'Ausgewogen' };
  for (const f of (opts.lite ? [] : ['frontline', 'backline', 'balanced']) as TargetFocus[]) {
    if (f === settings.targetFocus) continue;
    const pv = prepare(input, data, { ...settings, targetFocus: f }, f);
    if ('ok' in pv) continue;
    addVariant(focusLabels[f], scoreCandidates(pv, input, usable, settings)[0]?.option.itemId);
  }
  if (!opts.lite && p.playstyle.scenarios.length >= 2) {
    for (const sc of p.playstyle.scenarios) {
      const weights: Record<string, number> = {};
      for (const o of p.playstyle.scenarios) weights[o.id] = o.id === sc.id ? 1 : 0;
      const pv: Prepared = { ...p, ctx: { ...p.ctx, scenarioWeights: weights } };
      pv.current = evaluateBuild(p.own, pv.ctx);
      addVariant(`nur '${sc.name}'`, scoreCandidates(pv, input, usable, settings)[0]?.option.itemId);
    }
  }
  if (!opts.lite) {
    const quick = scoreCandidates(p, input, usable, { ...settings, horizonSec: 0 }, 'value', 60)[0]?.option.itemId;
    addVariant('sofortiger Stärkegewinn (60-s-Horizont)', quick);
  }

  const alternatives = pickAlternatives(ranked, bestId);
  const favorite = ranked.find((o) => o.itemId === bestId) ?? null;
  const components = favorite && !opts.lite ? componentPlan(p, input, favorite) : null;
  const preview = bestId !== null && !opts.lite ? buildPreview(p, input, bestId) : [];
  const mix = myDamageMix(p);
  const counters = opts.lite ? [] : counterChecks(p, data, ranked, bestId, alternatives.map((a) => a.itemId), exclusions, mix, variantWinners);
  const interimCounters = opts.lite || !favorite ? [] : interimCounterOptions(p, input, favorite, mix);

  // Verkauf nur als markierte Ausnahme: volles Inventar, späte Phase, deutlicher Mehrwert.
  let sellException: EvaluationResult['sellException'] = null;
  const finished = input.me.items.filter((id) => p.items.get(id)?.tier === 'legendary');
  if (!opts.lite && input.me.items.length >= 6 && input.gameTime >= 1800 && finished.length >= 5 && blockedBySlots.length) {
    for (const sell of finished) {
      const sellItem = p.items.get(sell)!;
      const without = applyItem(p.own, sellItem, -1);
      for (const c of blockedBySlots) {
        const after = applyItem(without, c.item, 1);
        const gain = combine(gainsBetween(p.current, evaluateBuild(after, p.ctx)), p.weights);
        const netCost = c.item.cost - Math.round(sellItem.cost * data.patch.rules.sellRatio);
        if (gain > 0.12 && (!sellException || gain > sellException.gain)) sellException = { sellId: sell, buyId: c.item.id, gain, netCost };
      }
    }
  }

  // Warnungen & Annahmen (sichtbar in der UI).
  if (input.patchStatus.restricted) warnings.push(input.patchStatus.message);
  if (!input.data.fresh) warnings.push(`Datenstand ist ${Number.isFinite(input.data.ageSec) ? Math.round(input.data.ageSec) + ' s' : 'unbekannt'} alt – Anzeige zeigt letzten gültigen Zustand.`);
  const unknownEnemies = p.enemies.filter((e) => !e.champ.itemsKnown);
  if (unknownEnemies.length) warnings.push(`Gegnerinventare unbekannt für: ${unknownEnemies.map((e) => e.champ.championName).join(', ')}.`);
  if (p.profile.supportLevel !== 'supported') warnings.push(`${p.profile.name} ist nur teilweise modelliert: ${p.profile.coverage.unmodeled.join('; ')}.`);
  for (const n of p.own.notes) assumptions.push(n);
  assumptions.push(`Goldrate ${input.goldRate.value.toFixed(1)} g/s (${input.goldRate.kind === 'observed' ? 'beobachtet' : 'geschätzt nach Rolle/Spielzeit'}).`);
  for (const sc of p.playstyle.scenarios) {
    assumptions.push(`Szenario '${sc.name}': ${sc.duration} s, Auto-Uptime ${Math.round(sc.autoUptime * 100)} %, Ziel fehlt ${Math.round(sc.targetMissingHp * 100)} % Leben, Gewicht ${Math.round(sc.weight * 100)} %${sc.note ? ' – ' + sc.note : ''}.`);
  }
  assumptions.push(`Zielgewichtung ist eine Annahme über erreichbare Ziele (Einstellung: ${focusLabels[settings.targetFocus]}), keine Positionsdaten.`);
  assumptions.push(`Kriteriengewichte (nach Bedrohung angepasst): Schaden ${Math.round(p.weights.offense * 100)} %, Sicherheit ${Math.round(p.weights.defense * 100)} %, Utility ${Math.round(p.weights.utility * 100)} %.`);

  const confidence = favorite?.confidence ?? 0;
  return {
    ok: true,
    generatedAtGameTime: input.gameTime,
    championKey: p.profile.key,
    championName: p.profile.name,
    supportLevel: p.profile.supportLevel,
    playstyle: { id: p.playstyle.id, name: p.playstyle.name },
    role: input.me.role,
    focus: settings.targetFocus,
    weights: p.weights,
    threat: p.ctx.threat,
    myDamageMix: mix,
    current: p.current,
    options: ranked,
    ranking: ranked.map((o) => o.itemId),
    bestId,
    modelBestId,
    alternatives,
    components,
    preview,
    exclusions,
    counters,
    variants,
    robust,
    sellException,
    interimCounters,
    enemies: enemyViews(p, input, now),
    warnings,
    assumptions,
    confidence,
    input,
  };
}

export { isBoots };
