// Minimaler NBT-Leser (big-endian, unkomprimiert) für .litematic-Dateien.
export type NbtValue =
  | number | bigint | string
  | Int8Array | Int32Array | BigInt64Array
  | NbtValue[] | { [key: string]: NbtValue };
export type NbtCompound = { [key: string]: NbtValue };

export async function gunzip(data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes; // schon unkomprimiert
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function parseNbt(bytes: Uint8Array): NbtCompound {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  let p = 0;

  const str = () => {
    const n = view.getUint16(p); p += 2;
    const s = dec.decode(bytes.subarray(p, p + n)); p += n;
    return s;
  };
  const payload = (type: number): NbtValue => {
    switch (type) {
      case 1: return view.getInt8(p++);
      case 2: { const v = view.getInt16(p); p += 2; return v; }
      case 3: { const v = view.getInt32(p); p += 4; return v; }
      case 4: { const v = view.getBigInt64(p); p += 8; return v; }
      case 5: { const v = view.getFloat32(p); p += 4; return v; }
      case 6: { const v = view.getFloat64(p); p += 8; return v; }
      case 7: {
        const n = view.getInt32(p); p += 4;
        const a = new Int8Array(n); for (let i = 0; i < n; i++) a[i] = view.getInt8(p + i);
        p += n; return a;
      }
      case 8: return str();
      case 9: {
        const t = view.getInt8(p++); const n = view.getInt32(p); p += 4;
        const list: NbtValue[] = [];
        for (let i = 0; i < n; i++) list.push(payload(t));
        return list;
      }
      case 10: {
        const obj: NbtCompound = {};
        for (;;) {
          const t = view.getInt8(p++);
          if (t === 0) break;
          const k = str();
          obj[k] = payload(t);
        }
        return obj;
      }
      case 11: {
        const n = view.getInt32(p); p += 4;
        const a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = view.getInt32(p + i * 4);
        p += n * 4; return a;
      }
      case 12: {
        const n = view.getInt32(p); p += 4;
        const a = new BigInt64Array(n); for (let i = 0; i < n; i++) a[i] = view.getBigInt64(p + i * 8);
        p += n * 8; return a;
      }
      default: throw new Error(`Unbekannter NBT-Tag ${type}`);
    }
  };

  if (view.getInt8(p++) !== 10) throw new Error('Keine gültige NBT-Datei');
  str(); // Name des Wurzel-Compounds
  return payload(10) as NbtCompound;
}
