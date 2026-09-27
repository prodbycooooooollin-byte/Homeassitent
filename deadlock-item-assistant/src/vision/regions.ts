import type { Rect } from './raster';

// Bildbereiche, die die Erkennung überhaupt braucht. Nur diese werden aus dem Aufnahme-Stream kopiert.
//  - unten links: Boon-Zähler, Souls, Item-Slots
//  - oben Mitte: Heldenporträts und darunter die Tab-Item-Spalten
export function captureRegions(W: number, H: number): Rect[] {
  const r = (x: number, y: number, w: number, h: number): Rect => {
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    return { x: x0, y: y0, w: Math.min(W, Math.ceil(x + w)) - x0, h: Math.min(H, Math.ceil(y + h)) - y0 };
  };
  return [
    r(0, H * 0.68, Math.min(W, H * 0.5), H * 0.32),
    r(W * 0.18, 0, W * 0.64, H * 0.62),
  ];
}
