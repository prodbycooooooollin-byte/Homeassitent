import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ChampionKnowledge, ChampionProfile, CombatRules, GrowthStats, ItemDef, PatchData, PatchManifest,
} from '../shared/types';

export const BASELINE_DATASET = 'curated-baseline';

export type PatchLevel = 'validated' | 'unvalidated' | 'version-unknown' | 'version-mismatch';

export interface PatchStatus {
  datasetId: string;
  gameVersion: string | null;
  level: PatchLevel;
  /** true = Empfehlungen sind sichtbar eingeschränkt. */
  restricted: boolean;
  message: string;
}

export interface LoadedData {
  patch: PatchData;
  status: PatchStatus;
  knowledge: Map<string, ChampionKnowledge>;
  profiles: Map<string, ChampionProfile>;
  problems: string[];
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/** "26.19.712.1234" → "26.19" */
export function majorMinor(version: string | null | undefined): string | null {
  if (!version) return null;
  const m = /^(\d+)\.(\d+)/.exec(version.trim());
  return m ? `${m[1]}.${m[2]}` : null;
}

export function validateItems(items: ItemDef[]): string[] {
  const problems: string[] = [];
  const ids = new Set<number>();
  for (const it of items) {
    if (ids.has(it.id)) problems.push(`Item ${it.id} doppelt definiert`);
    ids.add(it.id);
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const it of items) {
    let componentCost = 0;
    for (const r of it.recipe) {
      const c = byId.get(r);
      if (!c) problems.push(`Rezept von ${it.name} (${it.id}) verweist auf unbekanntes Item ${r}`);
      else componentCost += c.cost;
    }
    if (componentCost > it.cost) problems.push(`Komponenten von ${it.name} kosten mehr als das Item`);
    if (it.coverage !== 'full' && !(it.unmodeled && it.unmodeled.length)) {
      problems.push(`${it.name}: Abdeckung '${it.coverage}' ohne dokumentierte Lücken`);
    }
  }
  return problems;
}

/**
 * Lädt den passenden Patch-Datensatz. Gibt es einen Ordner für die laufende
 * Spielversion (major.minor), wird dieser verwendet – sonst die kuratierte
 * Basis, und zwar sichtbar als eingeschränkt markiert (keine stille Nutzung).
 */
export function loadData(dataDir: string, gameVersion: string | null, opts: { strict?: boolean } = {}): LoadedData {
  const problems: string[] = [];
  const mm = majorMinor(gameVersion);
  const patchesDir = path.join(dataDir, 'patches');
  let datasetId = BASELINE_DATASET;
  if (mm && fs.existsSync(path.join(patchesDir, mm, 'manifest.json'))) datasetId = mm;
  const dir = path.join(patchesDir, datasetId);

  const manifest = readJson<PatchManifest>(path.join(dir, 'manifest.json'));
  const itemList = readJson<ItemDef[]>(path.join(dir, 'items.json'));
  problems.push(...validateItems(itemList));
  const namesFile = path.join(dir, 'names.de_DE.json');
  if (fs.existsSync(namesFile)) {
    const names = readJson<Record<string, string>>(namesFile);
    for (const it of itemList) if (names[it.id]) it.nameDe = names[it.id];
  }
  const statsFile = readJson<{ stats: Record<string, GrowthStats> }>(path.join(dir, 'champion-stats.json'));
  const rules = readJson<CombatRules>(path.join(dataDir, 'rules', 'combat-rules.json'));

  const validated = mm !== null && manifest.validatedGameVersions.includes(mm);
  let level: PatchLevel;
  let message: string;
  if (!mm) {
    level = 'version-unknown';
    message = `Spielversion unbekannt – Datensatz '${datasetId}' (${manifest.authoredAgainst}) wird ohne Versionsabgleich genutzt.`;
  } else if (validated) {
    level = 'validated';
    message = `Datensatz '${datasetId}' ist für ${mm} geprüft.`;
  } else if (datasetId === mm) {
    level = 'unvalidated';
    message = `Datensatz für ${mm} vorhanden (Data-Dragon-Sync), Mechaniken aber noch nicht fachlich geprüft.`;
  } else {
    level = 'version-mismatch';
    message = `Kein Datensatz für ${mm}. Genutzt wird '${datasetId}' (${manifest.authoredAgainst}) – Preise/Werte können abweichen.`;
  }
  const restricted = level !== 'validated';
  if (opts.strict && restricted) message += ' Strikter Modus: Empfehlungen werden nicht angezeigt.';

  return {
    patch: {
      manifest,
      items: new Map(itemList.map((i) => [i.id, i])),
      championStats: new Map(Object.entries(statsFile.stats)),
      rules,
    },
    status: { datasetId, gameVersion: mm, level, restricted, message },
    knowledge: loadKnowledge(dataDir),
    profiles: loadProfiles(dataDir),
    problems,
  };
}

export function loadKnowledge(dataDir: string): Map<string, ChampionKnowledge> {
  const doc = readJson<{ champions: ChampionKnowledge[] }>(path.join(dataDir, 'champions', 'knowledge.json'));
  return new Map(doc.champions.map((c) => [c.key, c]));
}

export function loadProfiles(dataDir: string): Map<string, ChampionProfile> {
  const dir = path.join(dataDir, 'champions', 'profiles');
  const out = new Map<string, ChampionProfile>();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const p = readJson<ChampionProfile>(path.join(dir, f));
    out.set(p.key, p);
  }
  return out;
}

/** Standardwachstum von Championwerten pro Level (Riot-Formel). */
export function statAtLevel(base: number, growth: number, level: number, rules: CombatRules): number {
  const n = Math.max(0, Math.min(18, level) - 1);
  return base + growth * n * (rules.statGrowth.a + rules.statGrowth.b * n);
}

export function itemDisplayName(item: ItemDef | undefined, fallbackId?: number): string {
  if (!item) return `Unbekanntes Item #${fallbackId ?? '?'}`;
  return item.nameDe ?? item.name;
}
