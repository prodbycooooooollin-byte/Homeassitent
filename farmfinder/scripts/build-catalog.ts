// Sammelt Farm-Videos per YouTube-API und schreibt public/catalog.json.
// Aufruf: YOUTUBE_API_KEY=… npx tsx scripts/build-catalog.ts [--versions 26.3,1.21] [--types bonemeal,iron]
// Kosten: ~101 Quota-Einheiten je Kategorie × Version (Tageslimit 10 000).
import { readFileSync, writeFileSync } from 'node:fs';
import { FARM_TYPES, resolveQuery } from '../src/lib/catalog';
import { searchFarms } from '../src/lib/youtube';
import type { Farm } from '../src/lib/types';

const key = process.env.YOUTUBE_API_KEY;
if (!key) { console.error('YOUTUBE_API_KEY fehlt.'); process.exit(1); }

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]?.split(',').filter(Boolean) : undefined;
};
const versions = arg('versions') ?? ['26.3', '1.21'];
const types = FARM_TYPES.filter((t) => !arg('types') || arg('types')!.includes(t.id));
const OUT = new URL('../public/catalog.json', import.meta.url);

let old: { generated: string | null; entries: Record<string, Farm[]> } = { generated: null, entries: {} };
try { old = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* neu anlegen */ }

let failures = 0;
for (const t of types) {
  for (const v of versions) {
    const q = resolveQuery(t.de, v).ytQuery;
    try {
      const farms = await searchFarms(q, key);
      // Beschreibung kürzen, damit die Datei klein bleibt (Links/Materialien stehen meist vorne)
      old.entries[`${t.id}|${v}`] = farms.map((f) => ({ ...f, description: f.description.slice(0, 2500) }));
      console.log(`✔ ${t.id} ${v}: ${farms.length} Videos`);
    } catch (e) {
      failures++;
      console.error(`✘ ${t.id} ${v}: ${(e as Error).message}`);
      if (/quota/i.test((e as Error).message)) { console.error('Quota erschöpft – breche ab, behalte bisherige Daten.'); failures = 99; break; }
    }
  }
  if (failures >= 99) break;
}

old.generated = new Date().toISOString();
writeFileSync(OUT, JSON.stringify(old));
console.log(`catalog.json geschrieben (${Object.keys(old.entries).length} Einträge).`);
if (failures && failures < 99 && failures === types.length * versions.length) process.exit(1);
