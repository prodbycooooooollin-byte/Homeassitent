import type { CombatRules } from '../shared/types';
import { clamp } from './combat';
import type { ChampionEstimate } from './enemies';

export interface ThreatProfile {
  physical: number;
  magic: number;
  true: number;
  /** Anteil physischer Autoattacken an der gewichteten Bedrohung. */
  autoPhysical: number;
  critShare: number;
  burst: number;
  cleansableHardCc: number;
  tenacityRelevantCc: number;
  unstoppableCc: number;
  armorPenPct: number;
  lethality: number;
  magicPenPct: number;
  magicPenFlat: number;
  /** 0.6..1.8 – skaliert das Defensivgewicht. */
  index: number;
  top: { name: string; threat: number; notes: string[] }[];
}

const HARD_CC = new Set(['stun', 'root', 'charm', 'taunt', 'fear', 'suppression', 'polymorph', 'sleep', 'silence']);

export function buildThreatProfile(enemies: ChampionEstimate[], rules: CombatRules, gameTime: number): ThreatProfile {
  const total = enemies.reduce((s, e) => s + e.threat, 0) || 1;
  const p: ThreatProfile = {
    physical: 0, magic: 0, true: 0, autoPhysical: 0, critShare: 0, burst: 0,
    cleansableHardCc: 0, tenacityRelevantCc: 0, unstoppableCc: 0,
    armorPenPct: 0, lethality: 0, magicPenPct: 0, magicPenFlat: 0, index: 1, top: [],
  };
  const cleansable = new Set(rules.cleansableCc);
  const tenacityIgnores = new Set(rules.tenacityIgnores);
  for (const e of enemies) {
    const w = e.threat / total;
    const k = e.knowledge;
    p.physical += w * e.dmgMix.physical;
    p.magic += w * e.dmgMix.magic;
    p.true += w * e.dmgMix.true;
    const autoShare = k?.autoShare ?? 0.3;
    p.autoPhysical += w * autoShare * e.dmgMix.physical;
    p.critShare += w * e.critUser * autoShare;
    p.burst += w * (k?.burst ?? 0.5);
    const cc = k?.cc ?? [];
    if (cc.some((c) => HARD_CC.has(c) && cleansable.has(c))) p.cleansableHardCc += w;
    if (cc.some((c) => HARD_CC.has(c) && !tenacityIgnores.has(c))) p.tenacityRelevantCc += w;
    if (cc.some((c) => !cleansable.has(c))) p.unstoppableCc += w;
    p.armorPenPct += w * e.dmgMix.physical * e.enemyArmorPen;
    p.lethality += w * e.dmgMix.physical * e.enemyLethality;
    p.magicPenPct += w * e.dmgMix.magic * e.enemyMagicPen;
    p.magicPenFlat += w * e.dmgMix.magic * e.enemyMagicPenFlat;
  }
  if (p.physical > 0) { p.armorPenPct /= p.physical; p.lethality /= p.physical; }
  if (p.magic > 0) { p.magicPenPct /= p.magic; p.magicPenFlat /= p.magic; }
  const sorted = [...enemies].sort((a, b) => b.threat - a.threat);
  // Die größte Einzelbedrohung zählt stärker als die zweitgrößte (ein stark
  // vorne liegender Burst-Gegner reicht, um Sicherheit wichtiger zu machen).
  const mean = sorted.length >= 2 ? 0.65 * sorted[0].threat + 0.35 * sorted[1].threat : sorted[0]?.threat ?? 0;
  // Referenz: typischer Carry (Klassenschaden 0,9) mit erwartetem Itemstand und mittlerer Reichweite.
  void gameTime;
  const expected = 0.9 * 1.0 * 0.65;
  p.index = clamp(mean / expected, 0.6, 1.8);
  p.top = sorted.slice(0, 3).map((e) => ({ name: e.champ.championName, threat: e.threat, notes: [...e.threatNotes, ...e.leadNotes] }));
  return p;
}

/**
 * Wie zuverlässig bringt mein Team Antiheal auf dieses Ziel?
 * Ein vorhandenes Antiheal-Item beweist keine Anwendung – Reichweite, Klasse
 * und Anwendungsart (Schaden vs. getroffen werden) bestimmen die Abdeckung.
 */
export function teamAntihealCoverage(target: ChampionEstimate, allies: ChampionEstimate[]): { coverage: number; sources: string[] } {
  let miss = 1;
  const sources: string[] = [];
  const tLine = target.knowledge?.line ?? 0.5;
  for (const a of allies) {
    if (!a.hasAntiheal) continue;
    const k = a.knowledge;
    const cls = k?.cls ?? 'skirmisher';
    let rel: number;
    if (a.hasAntiheal === 'damage') {
      rel = ['marksman', 'burstMage', 'battleMage', 'artillery'].includes(cls) ? 0.8
        : ['assassin', 'skirmisher', 'diver', 'juggernaut'].includes(cls) ? 0.65 : 0.35;
      const reach = k?.ranged ? 0.9 * tLine + 0.55 * (1 - tLine) : 0.9 * tLine + (k?.dive ?? 0.4) * (1 - tLine);
      rel *= reach;
    } else {
      // Dornenpanzer & Co.: nur wenn das Ziel diesen Mitspieler mit Autos trifft.
      rel = 0.75 * (target.knowledge?.autoShare ?? 0.3) * (k ? k.line : 0.5);
    }
    if (rel > 0.05) sources.push(`${a.champ.championName} (${Math.round(rel * 100)} %)`);
    miss *= 1 - rel;
  }
  return { coverage: 1 - miss, sources };
}
