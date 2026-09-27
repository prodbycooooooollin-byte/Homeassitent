// Minimale Bildoperationen auf RGBA-Puffern. Keine Abhängigkeiten, damit dieselbe
// Erkennung im Electron-Hauptprozess (desktopCapturer) und in Tests (PNG) läuft.

export interface Raster {
  w: number;
  h: number;
  /** RGBA, 4 Byte je Pixel, zeilenweise */
  data: Uint8Array;
}

export interface Rect { x: number; y: number; w: number; h: number }

export function makeRaster(w: number, h: number): Raster {
  return { w, h, data: new Uint8Array(w * h * 4) };
}

/** BGRA (Electron NativeImage.toBitmap unter Windows) → RGBA, ohne Kopie des Rasters selbst. */
export function fromBGRA(w: number, h: number, buf: Uint8Array): Raster {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = buf[i + 2]!; data[i + 1] = buf[i + 1]!; data[i + 2] = buf[i]!; data[i + 3] = 255;
  }
  return { w, h, data };
}

export function clampRect(r: Raster, rect: Rect): Rect {
  const x = Math.max(0, Math.min(r.w, Math.round(rect.x)));
  const y = Math.max(0, Math.min(r.h, Math.round(rect.y)));
  const x2 = Math.max(x, Math.min(r.w, Math.round(rect.x + rect.w)));
  const y2 = Math.max(y, Math.min(r.h, Math.round(rect.y + rect.h)));
  return { x, y, w: x2 - x, h: y2 - y };
}

export function crop(r: Raster, rect: Rect): Raster {
  const c = clampRect(r, rect);
  const out = makeRaster(c.w, c.h);
  for (let y = 0; y < c.h; y++) {
    const src = ((c.y + y) * r.w + c.x) * 4;
    out.data.set(r.data.subarray(src, src + c.w * 4), y * c.w * 4);
  }
  return out;
}

/** Flächenmittelung (Box-Filter) auf ein Zielraster; für Fingerabdrücke und Verkleinerung. */
export function resizeArea(r: Raster, rect: Rect, tw: number, th: number): Float32Array {
  const out = new Float32Array(tw * th * 3);
  const sx = rect.w / tw, sy = rect.h / th;
  for (let ty = 0; ty < th; ty++) {
    const y0 = rect.y + ty * sy, y1 = y0 + sy;
    for (let tx = 0; tx < tw; tx++) {
      const x0 = rect.x + tx * sx, x1 = x0 + sx;
      let R = 0, G = 0, B = 0, A = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        if (y < 0 || y >= r.h) continue;
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          if (x < 0 || x >= r.w) continue;
          const wgt = wy * (Math.min(x + 1, x1) - Math.max(x, x0));
          const i = (y * r.w + x) * 4;
          const a = (r.data[i + 3]! / 255) * wgt;
          R += r.data[i]! * a; G += r.data[i + 1]! * a; B += r.data[i + 2]! * a; A += a;
        }
      }
      const o = (ty * tw + tx) * 3;
      if (A > 0) { out[o] = R / A; out[o + 1] = G / A; out[o + 2] = B / A; }
    }
  }
  return out;
}

/** Skaliert einen Ausschnitt (bilinear) – für OCR-Vorverarbeitung. */
export function scaleBilinear(r: Raster, rect: Rect, tw: number, th: number): Raster {
  const out = makeRaster(tw, th);
  for (let ty = 0; ty < th; ty++) {
    const fy = rect.y + ((ty + 0.5) * rect.h) / th - 0.5;
    const y0 = Math.max(0, Math.min(r.h - 1, Math.floor(fy))), y1 = Math.min(r.h - 1, y0 + 1), dy = Math.max(0, Math.min(1, fy - y0));
    for (let tx = 0; tx < tw; tx++) {
      const fx = rect.x + ((tx + 0.5) * rect.w) / tw - 0.5;
      const x0 = Math.max(0, Math.min(r.w - 1, Math.floor(fx))), x1 = Math.min(r.w - 1, x0 + 1), dx = Math.max(0, Math.min(1, fx - x0));
      const o = (ty * tw + tx) * 4;
      for (let c = 0; c < 3; c++) {
        const a = r.data[(y0 * r.w + x0) * 4 + c]!, b = r.data[(y0 * r.w + x1) * 4 + c]!;
        const d = r.data[(y1 * r.w + x0) * 4 + c]!, e = r.data[(y1 * r.w + x1) * 4 + c]!;
        out.data[o + c] = (a * (1 - dx) + b * dx) * (1 - dy) + (d * (1 - dx) + e * dx) * dy;
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}

export function px(r: Raster, x: number, y: number): [number, number, number] {
  const i = (y * r.w + x) * 4;
  return [r.data[i]!, r.data[i + 1]!, r.data[i + 2]!];
}

/** RGB → HSV (h 0–360, s/v 0–1) */
export function hsv(R: number, G: number, B: number): [number, number, number] {
  const r = R / 255, g = G / 255, b = B / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, mx === 0 ? 0 : d / mx, mx];
}

export interface Component { x0: number; y0: number; x1: number; y1: number; n: number }

/** Zusammenhängende Flächen (4er-Nachbarschaft) einer Maske innerhalb eines Rechtecks. */
export function components(mask: Uint8Array, w: number, h: number, minSize = 1): Component[] {
  const seen = new Uint8Array(w * h);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    const c: Component = { x0: w, y0: h, x1: -1, y1: -1, n: 0 };
    seen[i] = 1; stack.push(i);
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % w, y = (j - x) / w;
      c.n++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (x > 0 && mask[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; stack.push(j - 1); }
      if (x < w - 1 && mask[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && mask[j - w] && !seen[j - w]) { seen[j - w] = 1; stack.push(j - w); }
      if (y < h - 1 && mask[j + w] && !seen[j + w]) { seen[j + w] = 1; stack.push(j + w); }
    }
    if (c.n >= minSize) out.push(c);
  }
  return out;
}

/** Maske über ein Rechteck des Rasters mit einer Pixelbedingung. */
export function maskOf(r: Raster, rect: Rect, test: (R: number, G: number, B: number) => boolean): Uint8Array {
  const m = new Uint8Array(rect.w * rect.h);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const i = ((rect.y + y) * r.w + rect.x + x) * 4;
      if (test(r.data[i]!, r.data[i + 1]!, r.data[i + 2]!)) m[y * rect.w + x] = 1;
    }
  }
  return m;
}
