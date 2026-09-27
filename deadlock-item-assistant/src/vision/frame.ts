import { type HudReading, type PortraitHit, type SlotReading, type VisionRefs, findPortraits, readHud, readTabColumn, verifyPortraits } from './hud';
import { type NumberRead, type TextRecognizer, prepareSouls, prepareValue, readNumber } from './ocr';
import type { Raster } from './raster';

// Ein Bildschirmbild vollständig auswerten: HUD (eigene Souls, Itemwert, Items),
// Heldenporträts oben und – falls Tab gedrückt ist – die Item-Spalten darunter.

export interface FrameResult {
  width: number;
  height: number;
  hud: {
    reading: HudReading;
    souls: NumberRead;
    value: NumberRead;
    items: string[];
    unknownSlots: number;
    filledSlots: number;
  } | null;
  portraits: PortraitHit[];
  /** Porträt-Index → Items der Tab-Spalte (nur wenn sichtbar) */
  tab: Map<number, { items: string[]; unknown: number }>;
  ms: number;
}

export interface FrameOptions {
  /** bekannte Porträts aus früheren Bildern (spart die Suche) */
  knownPortraits?: PortraitHit[];
  /** Porträtsuche erzwingen */
  searchPortraits?: boolean;
}

function slotsToItems(slots: SlotReading[]) {
  const items = slots.filter((s) => s.state === 'item').map((s) => s.item!);
  return { items, unknown: slots.filter((s) => s.state === 'unknown').length, filled: slots.filter((s) => s.state !== 'empty').length };
}

export async function analyzeFrame(r: Raster, refs: VisionRefs, ocr: TextRecognizer | null, opts: FrameOptions = {}): Promise<FrameResult> {
  const t0 = Date.now();
  const reading = readHud(r, refs);
  let hud: FrameResult['hud'] = null;
  if (reading) {
    const none: NumberRead = { value: null, text: '', confidence: 0 };
    const souls = ocr ? await readNumber(ocr, prepareSouls(r, reading.soulsRect)) : none;
    const value = ocr ? await readNumber(ocr, prepareValue(r, reading.valueRect)) : none;
    const s = slotsToItems(reading.slots);
    hud = { reading, souls, value, items: s.items, unknownSlots: s.unknown, filledSlots: s.filled };
  }
  const scale = reading?.scale ?? r.h / 1080;
  let portraits = opts.knownPortraits?.length && !opts.searchPortraits ? verifyPortraits(r, refs, opts.knownPortraits) : [];
  if (!portraits.length || opts.searchPortraits) portraits = findPortraits(r, refs, scale);
  const tab = new Map<number, { items: string[]; unknown: number }>();
  portraits.forEach((p, i) => {
    const col = readTabColumn(r, p, refs);
    if (col) { const s = slotsToItems(col); tab.set(i, { items: s.items, unknown: s.unknown }); }
  });
  return { width: r.w, height: r.h, hud, portraits, tab, ms: Date.now() - t0 };
}
