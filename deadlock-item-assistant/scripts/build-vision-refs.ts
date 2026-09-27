import * as fs from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { fingerprint } from '../src/vision/fingerprint';
import { GEO, HERO_FP_N, ITEM_FP_N } from '../src/vision/hud';
import type { Raster } from '../src/vision/raster';
import type { RefsFile } from '../src/vision/refs';

// Erzeugt data/vision/refs.json aus den offiziellen Icons (Quelle: data/vision/sources.json).
// Die Bilder werden in data/raw/vision zwischengespeichert (nicht eingecheckt).
//   npm run vision:refs

const root = path.join(__dirname, '..');
const sources = JSON.parse(fs.readFileSync(path.join(root, 'data/vision/sources.json'), 'utf8')) as { base: string; items: Record<string, string>; heroes: Record<string, string> };
const items = JSON.parse(fs.readFileSync(path.join(root, 'data/gamedata/items.json'), 'utf8')) as { className: string; slot: 'weapon' | 'vitality' | 'spirit' }[];
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/gamedata/manifest.json'), 'utf8')) as { build: number };
const cache = path.join(root, 'data/raw/vision');

async function get(rel: string): Promise<Raster> {
  const file = path.join(cache, rel);
  if (!fs.existsSync(file)) {
    const res = await fetch(sources.base + rel);
    if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const p = PNG.sync.read(fs.readFileSync(file));
  return { w: p.width, h: p.height, data: new Uint8Array(p.data) };
}

async function main() {
  const out: RefsFile = { forBuild: manifest.build, itemFpN: ITEM_FP_N, heroFpN: HERO_FP_N, items: {}, heroes: {} };
  const slotOf = new Map(items.map((i) => [i.className, i.slot]));
  const failed: string[] = [];
  for (const [cls, rel] of Object.entries(sources.items)) {
    const slot = slotOf.get(cls);
    if (!slot) { failed.push(`${cls} (nicht im Datensatz)`); continue; }
    try {
      const r = await get(rel);
      out.items[cls] = { slot, fp: Buffer.from(fingerprint(r, { x: 0, y: 0, w: r.w, h: r.h }, ITEM_FP_N)).toString('base64') };
    } catch (e) { failed.push(`${cls}: ${(e as Error).message}`); }
  }
  const f = GEO.portrait.face, k = GEO.portrait.cardScale;
  for (const [cls, rel] of Object.entries(sources.heroes)) {
    try {
      const r = await get(rel);
      out.heroes[cls] = Buffer.from(fingerprint(r, { x: f.dx / k, y: f.dy / k, w: f.w / k, h: f.h / k }, HERO_FP_N)).toString('base64');
    } catch (e) { failed.push(`${cls}: ${(e as Error).message}`); }
  }
  fs.writeFileSync(path.join(root, 'data/vision/refs.json'), JSON.stringify(out));
  console.log(`Items: ${Object.keys(out.items).length}, Heroes: ${Object.keys(out.heroes).length}`);
  const missing = items.filter((i) => !out.items[i.className]).map((i) => i.className);
  if (missing.length) console.log('Ohne Referenz:', missing.join(', '));
  if (failed.length) console.log('Fehler:', failed.join('; '));
}
void main();
