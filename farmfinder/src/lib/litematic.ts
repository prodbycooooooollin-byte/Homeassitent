import { gunzip, parseNbt, type NbtCompound, type NbtValue } from './nbt';

export interface Material { name: string; count: number }

export interface SchematicModel {
  name: string;
  size: [number, number, number];
  /** Block-Positionen und Palette-Index, flach: x,y,z,idx,… */
  blocks: Int32Array;
  palette: string[];
  /** Properties pro Palette-Eintrag (z. B. type=double) */
  props: Record<string, string>[];
  totalBlocks: number;
  materials: Material[];
}

const AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

const SKIP = new Set(['water', 'lava', 'piston_head', 'moving_piston', 'bubble_column', 'fire', 'soul_fire', 'light', 'structure_void']);
const RENAME: Record<string, string> = {
  redstone_wire: 'redstone', redstone_wall_torch: 'redstone_torch', wall_torch: 'torch', soul_wall_torch: 'soul_torch',
  repeater: 'repeater', comparator: 'comparator', tripwire: 'string', wall_sign: 'sign',
  water_cauldron: 'cauldron', lava_cauldron: 'cauldron', powder_snow_cauldron: 'cauldron',
  carrots: 'carrot', potatoes: 'potato', wheat: 'wheat_seeds', beetroots: 'beetroot_seeds',
  melon_stem: 'melon_seeds', pumpkin_stem: 'pumpkin_seeds', sweet_berry_bush: 'sweet_berries',
  cocoa: 'cocoa_beans', kelp_plant: 'kelp', bamboo_sapling: 'bamboo', tall_seagrass: 'seagrass',
};
const ITEM_NAMES: Record<string, string> = {
  redstone: 'Redstone Dust', repeater: 'Redstone Repeater', comparator: 'Redstone Comparator',
  wheat_seeds: 'Wheat Seeds', carrot: 'Carrot', potato: 'Potato',
};

const titleCase = (id: string) => id.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** Block → Item (null = kein Material, z. B. Luft/Wasser/Oberhälften). */
export function blockToMaterial(id: string, props: Record<string, string> = {}): Material | null {
  const base = id.replace(/^minecraft:/, '');
  if (AIR.has(id) || SKIP.has(base)) return null;
  if (props.half === 'upper' || props.part === 'head') return null; // Türen, hohe Pflanzen, Betten zählen einmal
  const key = RENAME[base] ?? base;
  const name = ITEM_NAMES[key] ?? titleCase(key);
  return { name, count: props.type === 'double' ? 2 : 1 };
}

const num = (v: NbtValue | undefined) => Number(v ?? 0);

function readPalette(list: NbtValue): { names: string[]; props: Record<string, string>[] } {
  const names: string[] = [];
  const props: Record<string, string>[] = [];
  for (const e of list as NbtCompound[]) {
    names.push(String(e.Name));
    const pr: Record<string, string> = {};
    const raw = e.Properties as NbtCompound | undefined;
    if (raw) for (const k of Object.keys(raw)) pr[k] = String(raw[k]);
    props.push(pr);
  }
  return { names, props };
}

/** Liest Werte aus dem bit-gepackten Long-Array (Einträge dürfen Long-Grenzen überschreiten). */
function makeReader(arr: BigInt64Array, bits: number) {
  const mask = (1n << BigInt(bits)) - 1n;
  const b = BigInt(bits);
  return (index: number): number => {
    const start = BigInt(index) * b;
    const i = Number(start >> 6n);
    const off = start & 63n;
    let v = BigInt.asUintN(64, arr[i]) >> off;
    if (off + b > 64n) v |= BigInt.asUintN(64, arr[i + 1] ?? 0n) << (64n - off);
    return Number(v & mask);
  };
}

export async function parseLitematic(data: ArrayBuffer | Uint8Array, fallbackName = 'Schematic'): Promise<SchematicModel> {
  const root = parseNbt(await gunzip(data));
  const regions = root.Regions as NbtCompound | undefined;
  if (!regions) throw new Error('Keine Litematica-Datei (Regions fehlen).');
  const meta = (root.Metadata as NbtCompound | undefined) ?? {};

  const palette: string[] = [];
  const props: Record<string, string>[] = [];
  const paletteIdx = new Map<string, number>();
  const out: number[] = [];
  const counts = new Map<string, number>();
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let total = 0;

  for (const region of Object.values(regions) as NbtCompound[]) {
    const pos = region.Position as NbtCompound;
    const sz = region.Size as NbtCompound;
    const [sx, sy, sz_] = [num(sz.x), num(sz.y), num(sz.z)];
    const [ax, ay, az] = [Math.abs(sx), Math.abs(sy), Math.abs(sz_)];
    // negative Größe: Region reicht von Position aus in negative Richtung
    const ox = num(pos.x) + (sx < 0 ? sx + 1 : 0);
    const oy = num(pos.y) + (sy < 0 ? sy + 1 : 0);
    const oz = num(pos.z) + (sz_ < 0 ? sz_ + 1 : 0);

    const local = readPalette(region.BlockStatePalette);
    const bits = Math.max(2, Math.ceil(Math.log2(local.names.length)));
    const get = makeReader(region.BlockStates as BigInt64Array, bits);

    const map = local.names.map((n, i) => {
      let g = paletteIdx.get(n + JSON.stringify(local.props[i]));
      if (g === undefined) {
        g = palette.length;
        palette.push(n);
        props.push(local.props[i]);
        paletteIdx.set(n + JSON.stringify(local.props[i]), g);
      }
      return g;
    });
    const mats = local.names.map((n, i) => blockToMaterial(n, local.props[i]));

    for (let y = 0; y < ay; y++)
      for (let z = 0; z < az; z++)
        for (let x = 0; x < ax; x++) {
          const li = get((y * az + z) * ax + x);
          if (AIR.has(local.names[li])) continue;
          const X = ox + x, Y = oy + y, Z = oz + z;
          out.push(X, Y, Z, map[li]);
          total++;
          if (X < minX) minX = X; if (Y < minY) minY = Y; if (Z < minZ) minZ = Z;
          if (X > maxX) maxX = X; if (Y > maxY) maxY = Y; if (Z > maxZ) maxZ = Z;
          const m = mats[li];
          if (m) counts.set(m.name, (counts.get(m.name) ?? 0) + m.count);
        }
  }

  // auf Ursprung verschieben
  const blocks = Int32Array.from(out);
  if (total) for (let i = 0; i < blocks.length; i += 4) { blocks[i] -= minX; blocks[i + 1] -= minY; blocks[i + 2] -= minZ; }

  return {
    name: String(meta.Name ?? fallbackName),
    size: total ? [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1] : [0, 0, 0],
    blocks, palette, props, totalBlocks: total,
    materials: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}
