import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseLitematic, blockToMaterial } from '../src/lib/litematic';
import { findSchematicLinks, normalizeUrl } from '../src/lib/links';

// --- kleiner NBT-Schreiber nur für Tests ---
const enc = new TextEncoder();
const u16 = (n: number) => [(n >> 8) & 255, n & 255];
const i32 = (n: number) => [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const name = (s: string) => [...u16(enc.encode(s).length), ...enc.encode(s)];
type T = { t: number; b: number[] };
const str = (s: string): T => ({ t: 8, b: name(s) });
const int = (n: number): T => ({ t: 3, b: i32(n) });
const long = (v: bigint) => { const a = new Uint8Array(8); new DataView(a.buffer).setBigInt64(0, v); return [...a]; };
const longArr = (vs: bigint[]): T => ({ t: 12, b: [...i32(vs.length), ...vs.flatMap(long)] });
const list = (type: number, items: number[][]): T => ({ t: 9, b: [type, ...i32(items.length), ...items.flat()] });
const comp = (o: Record<string, T>): T => ({ t: 10, b: [...Object.entries(o).flatMap(([k, v]) => [v.t, ...name(k), ...v.b]), 0] });

/** packt Werte mit `bits` Bit je Eintrag über Long-Grenzen hinweg */
function pack(values: number[], bits: number): bigint[] {
  const total = values.length * bits;
  const longs = Array.from({ length: Math.ceil(total / 64) }, () => 0n);
  values.forEach((v, i) => {
    const start = i * bits;
    const li = Math.floor(start / 64), off = start % 64;
    longs[li] |= BigInt(v) << BigInt(off);
    if (off + bits > 64) longs[li + 1] |= BigInt(v) >> BigInt(64 - off);
  });
  return longs.map((l) => BigInt.asIntN(64, l));
}

function makeLitematic(size: [number, number, number], palette: string[], values: number[]) {
  const bits = Math.max(2, Math.ceil(Math.log2(palette.length)));
  const root = comp({
    Metadata: comp({ Name: str('Testfarm') }),
    Regions: comp({
      main: comp({
        Position: comp({ x: int(0), y: int(0), z: int(0) }),
        Size: comp({ x: int(size[0]), y: int(size[1]), z: int(size[2]) }),
        BlockStatePalette: list(10, palette.map((n) => comp({ Name: str(n) }).b)),
        BlockStates: longArr(pack(values, bits)),
      }),
    }),
  });
  return gzipSync(Buffer.from([10, ...name(''), ...root.b]));
}

describe('Litematica-Parser', () => {
  it('liest Blöcke, Palette und Materialliste (Bits über Long-Grenzen)', async () => {
    // 5 Palette-Einträge → 3 Bit je Block; 4x4x4 = 64 Blöcke → Einträge überschreiten Long-Grenzen
    const palette = ['minecraft:air', 'minecraft:hopper', 'minecraft:observer', 'minecraft:redstone_wire', 'minecraft:oak_slab'];
    const values = Array.from({ length: 64 }, (_, i) => (i % 7 === 0 ? 0 : (i % 4) + 1));
    const m = await parseLitematic(makeLitematic([4, 4, 4], palette, values));
    expect(m.name).toBe('Testfarm');
    const expected = (id: number) => values.filter((v) => v === id).length;
    expect(m.totalBlocks).toBe(values.filter((v) => v !== 0).length);
    expect(m.materials.find((x) => x.name === 'Hopper')?.count).toBe(expected(1));
    expect(m.materials.find((x) => x.name === 'Observer')?.count).toBe(expected(2));
    expect(m.materials.find((x) => x.name === 'Redstone Dust')?.count).toBe(expected(3));
    // Position stimmt: Index 1 → x=1,y=0,z=0 ist Hopper (values[1] = (1%4)+1 = 2 → observer)
    const i = Array.from({ length: m.blocks.length / 4 }, (_, k) => k).find((k) => m.blocks[k * 4] === 1 && m.blocks[k * 4 + 1] === 0 && m.blocks[k * 4 + 2] === 0)!;
    expect(m.palette[m.blocks[i * 4 + 3]]).toBe('minecraft:observer');
  });
  it('lehnt fremde Dateien ab', async () => {
    await expect(parseLitematic(gzipSync(Buffer.from([10, 0, 0, 0])))).rejects.toThrow();
  });
  it('mappt Blöcke auf Items', () => {
    expect(blockToMaterial('minecraft:oak_slab', { type: 'double' })).toEqual({ name: 'Oak Slab', count: 2 });
    expect(blockToMaterial('minecraft:oak_door', { half: 'upper' })).toBeNull();
    expect(blockToMaterial('minecraft:water')).toBeNull();
    expect(blockToMaterial('minecraft:redstone_wall_torch')?.name).toBe('Redstone Torch');
  });
});

describe('Links', () => {
  it('findet .litematic und Hoster, normalisiert Share-Links', () => {
    const links = findSchematicLinks(
      'Download: https://example.com/files/farm.litematic.\nDrive: https://drive.google.com/file/d/ABC123/view?usp=sharing\nInsta https://instagram.com/x\nhttps://www.dropbox.com/s/abc/farm.zip?dl=0',
    );
    expect(links[0]).toMatchObject({ url: 'https://example.com/files/farm.litematic', direct: true });
    expect(links.map((l) => l.url)).toContain('https://drive.google.com/uc?export=download&id=ABC123');
    expect(links.some((l) => l.url.includes('instagram'))).toBe(false);
    expect(links.find((l) => l.host.includes('dropbox'))?.url).toContain('dl=1');
    expect(normalizeUrl('https://github.com/a/b/blob/main/f.litematic')).toBe('https://raw.githubusercontent.com/a/b/main/f.litematic');
  });
});
