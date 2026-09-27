// MurmurHash2 (32 Bit) über den kleingeschriebenen Klassennamen mit Seed 0x31415926.
// ANNAHME: Source 2 bildet Item-/Ability-IDs so (MurmurHash2LowerCase). Das ist in dieser
// Umgebung NICHT gegen echte Match-Daten verifiziert. Der Spectator-Provider meldet
// unbekannte IDs in der Diagnose; ein Assets-Sync überschreibt berechnete IDs.
export const ITEM_HASH_SEED = 0x31415926;

export function murmurHash2(input: string, seed = ITEM_HASH_SEED): number {
  const data = Buffer.from(input, 'utf8');
  const m = 0x5bd1e995;
  let len = data.length;
  let h = (seed ^ len) >>> 0;
  let i = 0;
  while (len >= 4) {
    let k = data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24);
    k = Math.imul(k, m); k ^= k >>> 24; k = Math.imul(k, m);
    h = Math.imul(h, m) ^ k;
    i += 4; len -= 4;
  }
  switch (len) {
    case 3: h ^= data[i + 2] << 16; // fallthrough
    case 2: h ^= data[i + 1] << 8; // fallthrough
    case 1: h ^= data[i]; h = Math.imul(h, m);
  }
  h ^= h >>> 13; h = Math.imul(h, m); h ^= h >>> 15;
  return h >>> 0;
}

export const itemIdFromClassName = (className: string) => murmurHash2(className.toLowerCase());
