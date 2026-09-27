import { type Raster, type Rect, clampRect, components, hsv, makeRaster, maskOf } from './raster';

// Zahlen aus dem HUD lesen: Vorverarbeitung (Farbmaske → schwarzer Text auf Weiß, vergrößert)
// und Texterkennung mit tesseract.js (lokal, ohne Netz; Sprachdaten liegen der App bei).

export interface NumberRead {
  value: number | null;
  text: string;
  /** 0–100 laut Texterkennung */
  confidence: number;
}

export interface TextRecognizer {
  /** binäres Bild (schwarz auf weiß) → Text; whitelist = erlaubte Zeichen */
  recognize(img: Raster, whitelist: string): Promise<{ text: string; confidence: number }>;
  close(): Promise<void>;
}

const isCream = (R: number, G: number, B: number) => { const [, s, v] = hsv(R, G, B); return s < 0.36 && v > 0.72; };
const isMint = (R: number, G: number, B: number) => { const [h, s, v] = hsv(R, G, B); return h >= 135 && h <= 185 && s >= 0.3 && v >= 0.5; };

/** Maske → Raster (Text schwarz, Hintergrund weiß), mit Rand und ganzzahliger Vergrößerung. */
function maskToImage(mask: Uint8Array, w: number, h: number, sub: Rect, targetH: number): Raster {
  const k = Math.max(1, Math.round(targetH / Math.max(1, sub.h)));
  const pad = 12;
  const out = makeRaster(sub.w * k + pad * 2, sub.h * k + pad * 2);
  out.data.fill(255);
  for (let y = 0; y < sub.h; y++) {
    for (let x = 0; x < sub.w; x++) {
      if (!mask[(sub.y + y) * w + sub.x + x]) continue;
      for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) {
        const o = ((pad + y * k + yy) * out.w + pad + x * k + xx) * 4;
        out.data[o] = out.data[o + 1] = out.data[o + 2] = 0;
      }
    }
  }
  return out;
}

/** Boons im runden Zähler unten links: cremefarbene Ziffern auf Türkis. */
export function prepareBoons(r: Raster, rect: Rect): Raster | null {
  const c = clampRect(r, rect);
  const mask = maskOf(r, c, isCream);
  const comps = components(mask, c.w, c.h, 4).filter((q) => q.y1 - q.y0 + 1 >= c.h * 0.3);
  if (!comps.length) return null;
  const sub = unionRect(comps, c.w, c.h, 2);
  return maskToImage(mask, c.w, c.h, sub, 60);
}

/**
 * Große mintgrüne Zahl rechts neben dem Boon-Zähler. Im normalen Match: nicht ausgegebene Souls.
 * In der Sandbox steht dort der Itemwert mit dem Zusatz „ITEM VALUE“; itemValueLabel unterscheidet beide Fälle.
 */
export function prepareSoulsLine(r: Raster, rect: Rect): { digits: Raster; itemValueLabel: boolean } | null {
  const c = clampRect(r, rect);
  const mask = maskOf(r, c, isMint);
  const hOf = (q: { y0: number; y1: number }) => q.y1 - q.y0 + 1;
  const comps = components(mask, c.w, c.h, 6).sort((a, b) => a.x0 - b.x0);
  if (comps.length < 2) return null;
  // Das Souls-Symbol ($-ähnlich) steht links und ist deutlich höher als die Ziffern – nicht mitlesen
  const tallest = Math.max(...comps.map(hOf));
  const symbol = comps.find((q) => hOf(q) === tallest)!;
  const rest = comps.filter((q) => q !== symbol && q.x0 > symbol.x0);
  const cand = rest.filter((q) => hOf(q) >= tallest * 0.45).map(hOf).sort((a, b) => a - b);
  if (!cand.length) return null;
  const D = cand[Math.floor(cand.length / 2)]!;
  // Ziffernhöhe D; kleine Schrift („ITEM VALUE“) und Kommas fallen heraus, Kommas bleiben aber im Ausschnitt
  const digits = rest.filter((q) => hOf(q) >= D * 0.7);
  if (!digits.length) return null;
  // Zusammenhängende Ziffernfolge: Abstand zum Nachbarn höchstens eine Ziffernhöhe
  const run = [digits[0]!];
  for (let i = 1; i < digits.length; i++) {
    if (digits[i]!.x0 - run[run.length - 1]!.x1 > D * 0.9) break;
    run.push(digits[i]!);
  }
  const maxH = D;
  const sub = unionRect(run, c.w, c.h, 2);
  // Kommas (klein) liegen innerhalb der x-Spanne und bleiben erhalten; Zeilenhöhe großzügig
  sub.y = Math.max(0, sub.y - 2); sub.h = Math.min(c.h - sub.y, sub.h + Math.round(maxH * 0.35));
  const end = run[run.length - 1]!.x1;
  const top = Math.min(...run.map((q) => q.y0)), bottom = Math.max(...run.map((q) => q.y1));
  return { digits: maskToImage(mask, c.w, c.h, sub, 60), itemValueLabel: labelBesides(r, c, end, top, bottom, D) };
}

const isLabelTeal = (R: number, G: number, B: number) => { const [h, s, v] = hsv(R, G, B); return h >= 135 && h <= 185 && s >= 0.18 && v >= 0.45; };

/**
 * Sandbox-Zusatz „ITEM VALUE“: eine schmale, gleichmäßige Zeile kleiner türkiser Zeichen rechts neben
 * der Zahl (ca. 3 Ziffernhöhen breit, untere Hälfte der Zeile). Zu klein zum Lesen – daher an Form
 * und Breite erkannt. Im Match (nur Zahl) ist dort nichts.
 */
function labelBesides(r: Raster, c: Rect, end: number, top: number, bottom: number, D: number): boolean {
  const x0 = c.x + end + Math.round(D * 0.3), x1 = Math.min(r.w, c.x + end + Math.round(D * 6));
  const y0 = c.y + top + Math.round(D * 0.4), y1 = Math.min(r.h, c.y + bottom + Math.round(D * 0.15));
  const cols: boolean[] = [];
  for (let x = x0; x < x1; x++) {
    let hit = false;
    for (let y = y0; y < y1 && !hit; y++) { const i = (y * r.w + x) * 4; hit = isLabelTeal(r.data[i]!, r.data[i + 1]!, r.data[i + 2]!); }
    cols.push(hit);
  }
  const first = cols.indexOf(true);
  if (first < 0 || first > D * 1.5) return false;
  let last = first, gap = 0;
  for (let i = first; i < cols.length; i++) {
    if (cols[i]) { last = i; gap = 0; } else if (++gap > D * 0.6) break;
  }
  const span = last - first + 1;
  const fill = cols.slice(first, last + 1).filter(Boolean).length / span;
  return span >= D * 2 && span <= D * 4.2 && fill >= 0.4;
}


function unionRect(cs: { x0: number; y0: number; x1: number; y1: number }[], w: number, h: number, pad: number): Rect {
  const x0 = Math.max(0, Math.min(...cs.map((q) => q.x0)) - pad), y0 = Math.max(0, Math.min(...cs.map((q) => q.y0)) - pad);
  const x1 = Math.min(w - 1, Math.max(...cs.map((q) => q.x1)) + pad), y1 = Math.min(h - 1, Math.max(...cs.map((q) => q.y1)) + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Text → Zahl. Nur plausible Formate (1234 oder 1,234) werden akzeptiert. */
export function parseSouls(text: string): number | null {
  const t = text.replace(/\s+/g, '').replace(/\./g, ',');
  if (!/^\d{1,3}(,\d{3})*$|^\d{1,6}$/.test(t)) return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) && n <= 200_000 ? n : null;
}

export async function readNumber(ocr: TextRecognizer, img: Raster | null): Promise<NumberRead> {
  if (!img) return { value: null, text: '', confidence: 0 };
  const r = await ocr.recognize(img, '0123456789,');
  return { value: parseSouls(r.text.trim()), text: r.text.trim(), confidence: r.confidence };
}

/** Unkomprimiertes 24-Bit-BMP (von Leptonica/tesseract direkt lesbar). */
export function encodeBmp(r: Raster): Buffer {
  const rowSize = Math.ceil((r.w * 3) / 4) * 4;
  const size = 54 + rowSize * r.h;
  const b = Buffer.alloc(size);
  b.write('BM', 0); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14); b.writeInt32LE(r.w, 18); b.writeInt32LE(r.h, 22);
  b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rowSize * r.h, 34);
  for (let y = 0; y < r.h; y++) {
    const row = 54 + (r.h - 1 - y) * rowSize;
    for (let x = 0; x < r.w; x++) {
      const i = (y * r.w + x) * 4;
      b[row + x * 3] = r.data[i + 2]!; b[row + x * 3 + 1] = r.data[i + 1]!; b[row + x * 3 + 2] = r.data[i]!;
    }
  }
  return b;
}

/** tesseract.js-Anbindung. Lädt Kern und Sprachdaten aus den mitgelieferten Paketen (kein Download). */
export async function createTesseract(): Promise<TextRecognizer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const T = require('tesseract.js') as typeof import('tesseract.js');
  const path = require('node:path') as typeof import('node:path');
  const unpack = (p: string) => p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  const langPath = unpack(path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int'));
  const workerPath = unpack(require.resolve('tesseract.js/src/worker-script/node/index.js'));
  const worker = await T.createWorker('eng', 1, { langPath, workerPath, gzip: true, cacheMethod: 'none' });
  let current = '';
  return {
    async recognize(img, whitelist) {
      if (whitelist !== current) {
        await worker.setParameters({ tessedit_char_whitelist: whitelist, tessedit_pageseg_mode: '7' as never });
        current = whitelist;
      }
      const r = await worker.recognize(encodeBmp(img));
      return { text: r.data.text, confidence: r.data.confidence };
    },
    async close() { await worker.terminate(); },
  };
}
