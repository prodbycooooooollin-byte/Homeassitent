import * as fs from 'node:fs';
import type { Slot, VisionRefs } from './hud';
import { normFromFp } from './hud';

// Referenz-Fingerabdrücke laden (data/vision/refs.json, erzeugt mit `npm run vision:refs`).

export interface RefsFile {
  forBuild: number;
  itemFpN: number;
  heroFpN: number;
  items: Record<string, { slot: Slot; fp: string }>;
  heroes: Record<string, string>;
}

export function refsFromFile(f: RefsFile): VisionRefs {
  const items = new Map<string, Float32Array>();
  const itemSlot = new Map<string, Slot>();
  for (const [cls, v] of Object.entries(f.items)) {
    items.set(cls, normFromFp(new Uint8Array(Buffer.from(v.fp, 'base64'))));
    itemSlot.set(cls, v.slot);
  }
  const heroes = new Map<string, Uint8Array>();
  for (const [cls, v] of Object.entries(f.heroes)) heroes.set(cls, new Uint8Array(Buffer.from(v, 'base64')));
  return { items, itemSlot, heroes };
}

export function loadRefs(file: string): { refs: VisionRefs; forBuild: number } | null {
  if (!fs.existsSync(file)) return null;
  const f = JSON.parse(fs.readFileSync(file, 'utf8')) as RefsFile;
  return { refs: refsFromFile(f), forBuild: f.forBuild };
}
