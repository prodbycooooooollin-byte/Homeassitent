import * as fs from 'node:fs';
import * as path from 'node:path';
import { Advisor } from '../src/engine/advisor';
import { evaluate, type EvaluationResult } from '../src/engine/engine';
import { buildEngineInput, type EngineInput } from '../src/engine/input';
import { loadData, type LoadedData } from '../src/patch/patchData';
import { type SimChampion, type SimScenario, simToMatchState } from '../src/sim/simulation';
import { type AdvisorSettings, DEFAULT_SETTINGS } from '../src/shared/types';

export const DATA_DIR = path.resolve(__dirname, '..', 'data');
export const data: LoadedData = loadData(DATA_DIR, null);
const NOW = 1_700_000_000_000;

export function loadScenario(name: string): SimScenario {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'scenarios', `${name}.json`), 'utf8')) as SimScenario;
}

/** Kopie eines Szenarios mit geänderten Gegner-/Mitspieler-/eigenen Inventaren. */
export function variant(s: SimScenario, patch: { enemies?: Record<string, Partial<SimChampion>>; allies?: Record<string, Partial<SimChampion>>; me?: Partial<SimScenario['me']> }): SimScenario {
  const upd = (list: SimChampion[], p?: Record<string, Partial<SimChampion>>) => list.map((c) => (p?.[c.champion] ? { ...c, ...p[c.champion] } : { ...c }));
  return { ...s, enemies: upd(s.enemies, patch.enemies), allies: upd(s.allies, patch.allies), me: { ...s.me, ...(patch.me ?? {}) }, timeline: [] };
}

export function inputFor(s: SimScenario, settings: AdvisorSettings = DEFAULT_SETTINGS, step = -1, d: LoadedData = data): EngineInput {
  const st = simToMatchState(s, { step, manual: [] }, NOW);
  return buildEngineInput(st, settings, {}, d.status, NOW)!;
}

export function run(s: SimScenario, settings: Partial<AdvisorSettings> = {}, d: LoadedData = data): EvaluationResult {
  const full = { ...DEFAULT_SETTINGS, ...settings };
  const r = evaluate(inputFor(s, full, -1, d), d, full, NOW);
  if (!r.ok) throw new Error(`Engine lieferte kein Ergebnis: ${r.message}`);
  return r;
}

export function score(r: EvaluationResult, itemId: number): number {
  const o = r.options.find((x) => x.itemId === itemId);
  if (!o) throw new Error(`Item ${itemId} ist kein Kandidat (Kandidaten: ${r.options.map((x) => x.itemId).join(', ')})`);
  return o.pathScore;
}

export function rank(r: EvaluationResult, itemId: number): number {
  return r.ranking.indexOf(itemId);
}

export function driver(r: EvaluationResult, itemId: number, kind: string): number {
  return r.options.find((x) => x.itemId === itemId)?.drivers.find((d) => d.kind === kind)?.contribution ?? 0;
}

/** Spielt eine Zeitleiste durch den Advisor (je Schritt `ticks` Poll-Takte). */
export function playTimeline(s: SimScenario, settings: Partial<AdvisorSettings> = {}, ticks = 2) {
  const full = { ...DEFAULT_SETTINGS, ...settings };
  const advisor = new Advisor(data, full);
  const favorites: (number | null)[] = [];
  for (let step = -1; step < (s.timeline?.length ?? 0); step++) {
    let fav: number | null = null;
    for (let t = 0; t < ticks; t++) fav = advisor.update(inputFor(s, full, step)).favoriteId;
    favorites.push(fav);
  }
  return { favorites, history: advisor.history };
}

export const ITEM = {
  IE: 3031, LDR: 3036, MORTAL: 3033, SERYLDA: 6694, KRAKEN: 6672, BORK: 3153, SHIELDBOW: 6673, GA: 3026,
  TERMINUS: 3302, VOID: 3135, CRYPT: 3137, RABADON: 3089, SHADOWFLAME: 4645, BANSHEE: 3102, ZHONYA: 3157,
  MORELLO: 3165, THORNMAIL: 3075, RANDUIN: 3143, FROZEN: 3110, DMP: 3742, WARMOG: 3083, FON: 4401, SV: 3065,
  STERAK: 3053, LAST_WHISPER: 3035, CLOAK: 1018, BF: 1038, PICKAXE: 1037, EOS: 6695, EON: 3814, YOUMUU: 3142,
  EXEC: 3123, BRAMBLE: 3076, JAKSHO: 6665, WITS: 3091, CHAIN: 1031, CLOTH: 1029,
};

/** Physische Durchdringung/Rüstungsreduktion (Stat oder Effekt). */
export const PHYS_PEN = (id: number) => {
  const it = data.patch.items.get(id);
  return !!(it && (it.stats.armorPenPct || it.stats.lethality
    || it.effects?.some((e) => e.type === 'armorShredStacking' || (e.type === 'penRampInFight' && e.armorPenMax > 0))));
};
