// Patch-Pflege: erzeugt data/patches/<major.minor>/ aus Riot Data Dragon + kuratierten Mechaniken.
//
//   npm run patch:sync -- 26.19            (lädt von ddragon.leagueoflegends.com)
//   npm run patch:sync -- 26.19 --from-dir ./ddragon-dump   (offline: item.json, item.de_DE.json, champion.json)
//
// Data Dragon liefert Preise, Rezepte, einfache Werte und Championbasiswerte.
// Durchdringung, Lethalität, Fähigkeitstempo und Effekte stehen dort nur im
// Tooltip-Text; sie werden NICHT aus Tooltips übernommen, sondern bleiben
// kuratiert und erscheinen im Bericht als "manuell prüfen".

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GrowthStats, ItemDef, PatchManifest, StatBlock } from '../src/shared/types';

interface DDItem {
  name: string;
  from?: string[];
  gold: { total: number; purchasable: boolean };
  maps: Record<string, boolean>;
  stats: Record<string, number>;
  tags: string[];
  depth?: number;
  requiredChampion?: string;
  inStore?: boolean;
}

const STAT_MAP: Record<string, { key: keyof StatBlock; scale?: number }> = {
  FlatPhysicalDamageMod: { key: 'ad' },
  FlatMagicDamageMod: { key: 'ap' },
  PercentAttackSpeedMod: { key: 'as' },
  FlatCritChanceMod: { key: 'crit' },
  FlatHPPoolMod: { key: 'hp' },
  FlatArmorMod: { key: 'armor' },
  FlatSpellBlockMod: { key: 'mr' },
  FlatMPPoolMod: { key: 'mana' },
  PercentMovementSpeedMod: { key: 'msPct' },
  FlatMovementSpeedMod: { key: 'msFlat' },
  PercentLifeStealMod: { key: 'lifesteal' },
};

/** DDragon-Hauptversion für eine Spielversion (Annahme: 25.x → 15.x, 26.x → 16.x). */
export function ddragonMajorFor(gameMajor: number): number {
  return gameMajor >= 25 ? gameMajor - 10 : gameMajor;
}

export interface SyncReport {
  gameVersion: string;
  ddragonVersion: string;
  priceChanges: string[];
  recipeChanges: string[];
  statChanges: string[];
  removed: string[];
  uncurated: string[];
  manualReview: string[];
}

export function mergeItems(curated: ItemDef[], dd: Record<string, DDItem>, namesDe: Record<string, DDItem> | null, report: SyncReport): { items: ItemDef[]; names: Record<string, string> } {
  const out: ItemDef[] = [];
  const names: Record<string, string> = {};
  for (const c of curated) {
    const d = dd[String(c.id)];
    if (!d || !d.maps?.['11'] || d.gold?.purchasable === false) {
      report.removed.push(`${c.id} ${c.name}: nicht mehr kaufbar/vorhanden – aus Datensatz entfernt`);
      continue;
    }
    const next: ItemDef = { ...c, stats: { ...c.stats }, recipe: [...c.recipe] };
    if (d.gold.total !== c.cost) { report.priceChanges.push(`${c.name}: ${c.cost} → ${d.gold.total} g`); next.cost = d.gold.total; }
    const ddRecipe = (d.from ?? []).map(Number).sort();
    if (JSON.stringify(ddRecipe) !== JSON.stringify([...c.recipe].sort())) {
      report.recipeChanges.push(`${c.name}: [${c.recipe.join(', ')}] → [${ddRecipe.join(', ')}]`);
      next.recipe = (d.from ?? []).map(Number);
    }
    for (const [ddKey, v] of Object.entries(d.stats ?? {})) {
      const m = STAT_MAP[ddKey];
      if (!m) continue;
      const old = c.stats[m.key];
      if (old === undefined || Math.abs(old - v) > 1e-6) {
        report.statChanges.push(`${c.name}: ${m.key} ${old ?? '–'} → ${v}`);
        next.stats[m.key] = v;
      }
    }
    const tooltipOnly = (['lethality', 'armorPenPct', 'magicPenPct', 'magicPenFlat', 'ah', 'tenacity'] as const).filter((k) => c.stats[k] !== undefined);
    if (tooltipOnly.length || c.effects?.length) report.manualReview.push(`${c.name}: ${[...tooltipOnly, ...(c.effects ?? []).map((e) => e.type)].join(', ')}`);
    if (namesDe?.[String(c.id)]) names[c.id] = namesDe[String(c.id)].name;
    out.push(next);
  }
  // Neue/unkuratierte Items: nur Grundwerte für Gegnerschätzungen, nie als Kandidat.
  const known = new Set(out.map((i) => i.id));
  for (const [id, d] of Object.entries(dd)) {
    const n = Number(id);
    if (known.has(n) || !d.maps?.['11'] || !d.gold?.purchasable || d.requiredChampion || d.inStore === false) continue;
    if ((d.depth ?? 1) < 2 && d.gold.total < 1500) continue;
    const stats: StatBlock = {};
    for (const [k, v] of Object.entries(d.stats ?? {})) if (STAT_MAP[k]) stats[STAT_MAP[k].key] = v;
    out.push({
      id: n, name: d.name, cost: d.gold.total, recipe: (d.from ?? []).map(Number).filter((r) => dd[String(r)]),
      tier: (d.depth ?? 1) >= 3 ? 'legendary' : 'epic', tags: ['unkuratiert'], stats, coverage: 'stats-only',
      unmodeled: ['Effekte nicht kuratiert – nur Data-Dragon-Grundwerte'],
    });
    if (namesDe?.[id]) names[id] = namesDe[id].name;
    report.uncurated.push(`${n} ${d.name}`);
  }
  // Rezeptverweise auf nicht übernommene Items bereinigen.
  const ids = new Set(out.map((i) => i.id));
  for (const it of out) it.recipe = it.recipe.filter((r) => ids.has(r));
  return { items: out, names };
}

export function mergeChampionStats(dd: Record<string, { stats: Record<string, number> }>): Record<string, GrowthStats> {
  const out: Record<string, GrowthStats> = {};
  for (const [key, c] of Object.entries(dd)) {
    const s = c.stats;
    out[key] = { hp: s.hp, hpg: s.hpperlevel, ar: s.armor, arg: s.armorperlevel, mr: s.spellblock, mrg: s.spellblockperlevel, ad: s.attackdamage, adg: s.attackdamageperlevel, as: s.attackspeed, asg: (s.attackspeedperlevel ?? 0) / 100 };
  }
  return out;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const args = process.argv.slice(2);
  const version = args.find((a) => /^\d+\.\d+/.test(a));
  if (!version) { console.error('Aufruf: npm run patch:sync -- <major.minor> [--from-dir <ordner>]'); process.exit(1); }
  const mm = version.split('.').slice(0, 2).join('.');
  const fromDirIdx = args.indexOf('--from-dir');
  const root = path.resolve(__dirname, '..');
  let ddVersion = `${ddragonMajorFor(Number(mm.split('.')[0]))}.${mm.split('.')[1]}.1`;
  let items: { data: Record<string, DDItem> }; let itemsDe: { data: Record<string, DDItem> } | null = null;
  let champs: { data: Record<string, { stats: Record<string, number> }> };
  if (fromDirIdx >= 0) {
    const dir = path.resolve(args[fromDirIdx + 1]);
    const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    items = read('item.json'); champs = read('champion.json');
    if (fs.existsSync(path.join(dir, 'item.de_DE.json'))) itemsDe = read('item.de_DE.json');
    ddVersion = `${ddVersion} (lokal: ${dir})`;
  } else {
    const versions = await fetchJson('https://ddragon.leagueoflegends.com/api/versions.json') as string[];
    const prefix = ddVersion.split('.').slice(0, 2).join('.') + '.';
    const match = versions.find((v) => v.startsWith(prefix));
    if (!match) throw new Error(`Keine Data-Dragon-Version für ${mm} (gesucht: ${prefix}x). Neueste: ${versions[0]}. Bewusst kein Fallback auf eine andere Version.`);
    ddVersion = match;
    const base = `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/data`;
    items = await fetchJson(`${base}/en_US/item.json`) as typeof items;
    itemsDe = await fetchJson(`${base}/de_DE/item.json`) as typeof items;
    champs = await fetchJson(`${base}/en_US/champion.json`) as typeof champs;
  }
  const curated = JSON.parse(fs.readFileSync(path.join(root, 'data', 'patches', 'curated-baseline', 'items.json'), 'utf8')) as ItemDef[];
  const report: SyncReport = { gameVersion: mm, ddragonVersion: ddVersion, priceChanges: [], recipeChanges: [], statChanges: [], removed: [], uncurated: [], manualReview: [] };
  const merged = mergeItems(curated, items.data, itemsDe?.data ?? null, report);
  const outDir = path.join(root, 'data', 'patches', mm);
  fs.mkdirSync(outDir, { recursive: true });
  const manifest: PatchManifest = {
    id: mm, validatedGameVersions: [], authoredAgainst: `Data Dragon ${ddVersion} + kuratierte Mechaniken`,
    statsSource: `Data Dragon ${ddVersion} (Preise, Rezepte, Grundwerte, Championwerte)`,
    mechanicsSource: 'kuratiert aus curated-baseline – für diesen Patch NICHT geprüft',
    reviewStatus: 'Data-Dragon-Sync; Mechaniken und Tooltip-Werte manuell prüfen, dann validatedGameVersions ergänzen',
    createdAt: new Date().toISOString().slice(0, 10),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outDir, 'items.json'), '[\n' + merged.items.map((i) => JSON.stringify(i)).join(',\n') + '\n]\n');
  fs.writeFileSync(path.join(outDir, 'names.de_DE.json'), JSON.stringify(merged.names, null, 1));
  fs.writeFileSync(path.join(outDir, 'champion-stats.json'), JSON.stringify({ source: `Data Dragon ${ddVersion}`, stats: mergeChampionStats(champs.data) }, null, 1));
  const section = (t: string, xs: string[]) => `## ${t} (${xs.length})\n\n${xs.map((x) => `- ${x}`).join('\n') || '- keine'}\n`;
  fs.writeFileSync(path.join(outDir, 'SYNC-REPORT.md'), [
    `# Patch-Sync ${mm}`, '', `Data Dragon: ${ddVersion}`, '',
    'Status: **ungeprüft**. Erst nach manueller Prüfung der Abschnitte „Manuell prüfen“ und „Entfernt“ die Version in `manifest.json → validatedGameVersions` eintragen.', '',
    section('Preisänderungen', report.priceChanges), section('Rezeptänderungen', report.recipeChanges),
    section('Wertänderungen (Data Dragon)', report.statChanges), section('Entfernt', report.removed),
    section('Neu/unkuratiert (nur Grundwerte, kein Kandidat)', report.uncurated),
    section('Manuell prüfen (Tooltip-Werte & Effekte)', report.manualReview),
  ].join('\n'));
  console.log(`Datensatz geschrieben: ${outDir}`);
  console.log(`Preise ${report.priceChanges.length}, Rezepte ${report.recipeChanges.length}, Werte ${report.statChanges.length}, entfernt ${report.removed.length}, unkuratiert ${report.uncurated.length}`);
}

if (require.main === module) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
