import { type Raster, type Rect, resizeArea } from './raster';

// Farb-Fingerabdrücke für Bildvergleiche: Ausschnitt auf N×N Zellen mitteln.

export const FP_N = 10;

export function fingerprint(r: Raster, rect: Rect, n = FP_N): Uint8Array {
  const f = resizeArea(r, rect, n, n);
  const out = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.round(f[i]!);
  return out;
}

/** Mittlere absolute Farbabweichung (0–255) über die aktiven Zellen. */
export function fpDistance(a: Uint8Array, b: Uint8Array, mask: Uint8Array | null): number {
  let s = 0, c = 0;
  const cells = a.length / 3;
  for (let i = 0; i < cells; i++) {
    if (mask && !mask[i]) continue;
    s += Math.abs(a[i * 3]! - b[i * 3]!) + Math.abs(a[i * 3 + 1]! - b[i * 3 + 1]!) + Math.abs(a[i * 3 + 2]! - b[i * 3 + 2]!);
    c += 3;
  }
  return c ? s / c : 255;
}

export interface Match { key: string; dist: number; second: string | null; secondDist: number }

export function bestMatch(fp: Uint8Array, refs: Map<string, Uint8Array>, mask: Uint8Array | null): Match | null {
  let key: string | null = null, dist = Infinity, second: string | null = null, secondDist = Infinity;
  for (const [k, ref] of refs) {
    const d = fpDistance(fp, ref, mask);
    if (d < dist) { second = key; secondDist = dist; key = k; dist = d; } else if (d < secondDist) { second = k; secondDist = d; }
  }
  return key === null ? null : { key, dist, second, secondDist: Number.isFinite(secondDist) ? secondDist : 255 };
}
