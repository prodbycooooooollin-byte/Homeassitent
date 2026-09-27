import { type Match, bestMatch, fingerprint } from './fingerprint';
import { type Raster, type Rect, clampRect, components, hsv, maskOf } from './raster';

// HUD-Erkennung für Deadlock. Vermessen an echten Screenshots (1920×1080, Build 6701):
//  - Runder Boon-Zähler unten links (türkis). Er ist der Anker, alle Maße skalieren mit ihm.
//  - Rechts daneben große Zahl: im normalen Match die nicht ausgegebenen Souls; in der Sandbox
//    stattdessen „$N ITEM VALUE“ (Summe der Listenpreise des Besitzes).
//  - Darunter 2×6 Item-Slots, belegte Slots mit Stufen-Abzeichen oben rechts
//    (Waffe orange, Vitalität grün, Spirit violett).
//  - Oben Mitte: Heldenporträts. Mit gedrückter Tab-Taste erscheint unter jedem Porträt eine Item-Spalte.
// Es werden nur diese Bereiche ausgewertet. Nichts wird gespeichert oder versendet.

export type Slot = 'weapon' | 'vitality' | 'spirit';

/** Maße bei Referenzskala 1 (1080p), relativ zum Anker = linke untere Ecke der Türkisfläche des Boon-Zählers. */
export const GEO = {
  blobW: 46,
  blobH: 34,
  boons: { dx: 4, dy: -36, w: 38, h: 30 },
  // breit genug für sechsstellige Souls plus Zusatztext
  souls: { dx: 62, dy: -47, w: 260, h: 42 },
  tile: { dx: 76, dy: 22, size: 50, pitch: 56, cols: 6, rows: 2 },
  // Porträt: Kartenbild (280×380) im Maßstab 0,25 → Rahmen 70×95. Gesicht-Ausschnitt relativ dazu.
  portrait: { w: 70, h: 95, face: { dx: 19, dy: 20, w: 40, h: 56 }, cardScale: 0.25, topY: -8 },
  // Tab-Spalte relativ zur Porträt-Ecke
  tab: { dx: 5, dy: 336, size: 27, pitchX: 35, pitchY: 35, cols: 2, maxRows: 8 },
};

export interface VisionRefs {
  /** Item-Klasse → Fingerabdruck (8×8, kontrastnormiert) */
  items: Map<string, Float32Array>;
  itemSlot: Map<string, Slot>;
  /** Hero-Klasse → Fingerabdruck (8×8 roh) des Gesichtsausschnitts */
  heroes: Map<string, Uint8Array>;
}

export interface SlotReading {
  index: number;
  rect: Rect;
  badge: Slot | null;
  item: string | null;
  dist: number | null;
  margin: number | null;
  /** empty = kein Abzeichen; item = sicher erkannt; unknown = belegt, aber kein sicherer Treffer */
  state: 'empty' | 'item' | 'unknown';
}

export interface HudReading {
  anchor: { x: number; y: number };
  scale: number;
  boonsRect: Rect;
  soulsRect: Rect;
  slots: SlotReading[];
}

export const ITEM_FP_N = 8;
const ITEM_MASK = (() => {
  const n = ITEM_FP_N, m = new Uint8Array(n * n);
  // Abzeichen oben rechts (3×3) und unterste Zeilen („ACTIVE“-Schild in der Tab-Ansicht) ausblenden
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) m[y * n + x] = (x >= n - 3 && y < 3) || y >= n - 2 ? 0 : 1;
  return m;
})();

/** Kontrastnormierter Fingerabdruck (z-Werte über alle Kanäle der aktiven Zellen). */
export function normFingerprint(r: Raster, rect: Rect): Float32Array {
  return normFromFp(fingerprint(r, rect, ITEM_FP_N));
}

export function normFromFp(f: Uint8Array): Float32Array {
  const vals: number[] = [];
  for (let i = 0; i < ITEM_FP_N * ITEM_FP_N; i++) if (ITEM_MASK[i]) vals.push(f[i * 3]!, f[i * 3 + 1]!, f[i * 3 + 2]!);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
  return Float32Array.from(vals, (v) => (v - mean) / sd);
}

function normDist(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!);
  return s / a.length;
}

// ---------------- Anker ----------------

const isSoulTeal = (R: number, G: number, B: number) => {
  const [h, s, v] = hsv(R, G, B);
  return h >= 140 && h <= 175 && s >= 0.3 && s <= 0.8 && v >= 0.45 && v <= 0.85;
};

/** Sucht den türkisen Boon-Zähler unten links. null = HUD nicht sichtbar (Menü, Tod, Shop …). */
export function findAnchor(r: Raster): { x: number; y: number; scale: number; score: number } | null {
  const H = r.h;
  const region = clampRect(r, { x: 0, y: Math.round(H * 0.7), w: Math.round(H * 0.2), h: Math.round(H * 0.22) });
  const mask = maskOf(r, region, isSoulTeal);
  let best: { x: number; y: number; scale: number; score: number } | null = null;
  for (const c of components(mask, region.w, region.h, 40)) {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    let s = w / GEO.blobW;
    if (s < 0.45 || s > 2.6) continue;
    const aspect = h / w, fill = c.n / (w * h);
    if (aspect < 0.55 || aspect > 0.95 || fill < 0.4 || fill > 0.9) continue;
    // Plausibel ist nur eine Skala nahe der Bildhöhe (HUD skaliert mit der Auflösung); Abweichung bestrafen
    const expect = H / 1080;
    const score = 1 - Math.abs(Math.log(s / expect)) - Math.abs(aspect - GEO.blobH / GEO.blobW);
    // Die HUD-Größe folgt der Bildhöhe; liegt die Messung nahe daran, ist die Bildhöhe genauer als die Pixelbreite
    if (Math.abs(s / expect - 1) < 0.08) s = expect;
    if (!best || score > best.score) best = { x: region.x + c.x0, y: region.y + c.y1, scale: s, score };
  }
  return best && best.score > 0.3 ? best : null;
}

// ---------------- Abzeichen ----------------

/** Farbe des Stufen-Abzeichens oben rechts in einem Slot. */
export function badgeColor(r: Raster, tile: Rect): Slot | null {
  const k = tile.w * 0.24;
  const votes: Record<Slot | 'none', number> = { weapon: 0, vitality: 0, spirit: 0, none: 0 };
  let n = 0;
  for (let yy = 1; yy < k; yy += Math.max(1, k / 8)) {
    for (let xx = 1; xx < k; xx += Math.max(1, k / 8)) {
      if (xx + yy > k) continue;
      const x = Math.round(tile.x + tile.w - 1 - xx), y = Math.round(tile.y + yy);
      if (x < 0 || y < 0 || x >= r.w || y >= r.h) continue;
      const i = (y * r.w + x) * 4;
      const [h, s, v] = hsv(r.data[i]!, r.data[i + 1]!, r.data[i + 2]!);
      n++;
      // Grenzen aus HUD (kräftig) und Tab-Spalte (abgedunkelt) vermessen
      if (h >= 22 && h <= 50 && s >= 0.6 && v >= 0.55) votes.weapon++;
      else if (h >= 65 && h <= 100 && s >= 0.55 && v >= 0.4) votes.vitality++;
      else if (h >= 255 && h <= 315 && s >= 0.25 && v >= 0.5) votes.spirit++;
      else votes.none++;
    }
  }
  if (!n) return null;
  const top = (['weapon', 'vitality', 'spirit'] as Slot[]).sort((a, b) => votes[b] - votes[a])[0]!;
  return votes[top] / n >= 0.4 ? top : null;
}

// ---------------- Items ----------------

export const ITEM_ACCEPT = { maxDist: 0.5, minMargin: 0.08 };

export function matchItem(r: Raster, tile: Rect, badge: Slot | null, refs: VisionRefs): { item: string | null; dist: number; margin: number } {
  const fp = normFingerprint(r, tile);
  let best: [string, number] | null = null, second: [string, number] | null = null;
  for (const [cls, ref] of refs.items) {
    if (badge && refs.itemSlot.get(cls) !== badge) continue;
    const d = normDist(fp, ref);
    if (!best || d < best[1]) { second = best; best = [cls, d]; } else if (!second || d < second[1]) second = [cls, d];
  }
  if (!best) return { item: null, dist: 99, margin: 0 };
  const margin = (second?.[1] ?? 99) - best[1];
  const ok = best[1] <= ITEM_ACCEPT.maxDist && margin >= ITEM_ACCEPT.minMargin;
  return { item: ok ? best[0] : null, dist: best[1], margin };
}

/** jitter: kleine Positionssuche (Pixel) für winzige Icons, bei denen Rundung schon zählt */
function readTiles(r: Raster, rects: Rect[], refs: VisionRefs, jitter = 0): SlotReading[] {
  return rects.map((rect, index) => {
    const badge = badgeColor(r, rect);
    if (!badge) return { index, rect, badge, item: null, dist: null, margin: null, state: 'empty' as const };
    let m = matchItem(r, rect, badge, refs);
    for (let dy = -jitter; dy <= jitter; dy++) for (let dx = -jitter; dx <= jitter; dx++) {
      if (!dx && !dy) continue;
      const q = matchItem(r, { ...rect, x: rect.x + dx, y: rect.y + dy }, badge, refs);
      if (q.dist < m.dist) m = q;
    }
    return { index, rect, badge, item: m.item, dist: m.dist, margin: m.margin, state: m.item ? 'item' as const : 'unknown' as const };
  });
}

export function readHud(r: Raster, refs: VisionRefs): HudReading | null {
  const a = findAnchor(r);
  if (!a) return null;
  const s = a.scale;
  const rel = (g: { dx: number; dy: number; w: number; h: number }): Rect => ({ x: a.x + g.dx * s, y: a.y + g.dy * s, w: g.w * s, h: g.h * s });
  const t = GEO.tile;
  const rects: Rect[] = [];
  for (let row = 0; row < t.rows; row++) for (let col = 0; col < t.cols; col++) {
    rects.push({ x: Math.round(a.x + (t.dx + col * t.pitch) * s), y: Math.round(a.y + (t.dy + row * t.pitch) * s), w: Math.round(t.size * s), h: Math.round(t.size * s) });
  }
  return { anchor: { x: a.x, y: a.y }, scale: s, boonsRect: rel(GEO.boons), soulsRect: rel(GEO.souls), slots: readTiles(r, rects, refs) };
}

// ---------------- Porträts (oben) und Tab-Spalten ----------------

export interface PortraitHit {
  hero: string;
  /** linke obere Ecke des Porträtrahmens */
  x: number;
  y: number;
  scale: number;
  dist: number;
  margin: number;
}

export const HERO_FP_N = 8;
export const HERO_ACCEPT = { maxDist: 18, minMargin: 10, minSpread: 28 };

/** Standardabweichung der Helligkeit über die Zellen eines Fingerabdrucks. */
function spread(fp: Uint8Array): number {
  const n = fp.length / 3;
  let s = 0, q = 0;
  for (let i = 0; i < n; i++) { const l = (fp[i * 3]! + fp[i * 3 + 1]! + fp[i * 3 + 2]!) / 3; s += l; q += l * l; }
  const m = s / n;
  return Math.sqrt(Math.max(0, q / n - m * m));
}

/** Sucht Heldenporträts im oberen Bildstreifen (grob, dann fein). */
export function findPortraits(r: Raster, refs: VisionRefs, scale: number): PortraitHit[] {
  const f = GEO.portrait.face;
  const fw = f.w * scale, fh = f.h * scale;
  const hits: PortraitHit[] = [];
  const evalAt = (x: number, y: number): { hero: string; dist: number; margin: number } | null => {
    const fp = fingerprint(r, { x, y, w: fw, h: fh }, HERO_FP_N);
    // Flache Flächen (Schwarz, Himmel, Menüs) sind nie ein Porträt
    if (spread(fp) < HERO_ACCEPT.minSpread) return null;
    const m: Match | null = bestMatch(fp, refs.heroes, null);
    return m ? { hero: m.key, dist: m.dist, margin: m.secondDist - m.dist } : null;
  };
  const step = Math.max(2, Math.round(4 * scale));
  const x0 = Math.round(r.w * 0.2), x1 = Math.round(r.w * 0.8 - fw);
  const yMax = Math.round(30 * scale);
  const coarse: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y <= yMax; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const m = evalAt(x, y);
      if (m && m.dist < HERO_ACCEPT.maxDist * 1.8) coarse.push({ x, y, d: m.dist });
    }
  }
  coarse.sort((a, b) => a.d - b.d);
  const taken: { x: number; y: number }[] = [];
  for (const c of coarse) {
    if (taken.some((t) => Math.abs(t.x - c.x) < fw * 0.8)) continue;
    let best: { x: number; y: number; m: NonNullable<ReturnType<typeof evalAt>> } | null = null;
    for (let dy = -step; dy <= step; dy++) for (let dx = -step; dx <= step; dx++) {
      const m = evalAt(c.x + dx, c.y + dy);
      if (m && (!best || m.dist < best.m.dist)) best = { x: c.x + dx, y: c.y + dy, m };
    }
    if (!best) continue;
    taken.push({ x: best.x, y: best.y });
    if (best.m.dist <= HERO_ACCEPT.maxDist && best.m.margin >= HERO_ACCEPT.minMargin) {
      hits.push({ hero: best.m.hero, x: Math.round(best.x - f.dx * scale), y: Math.round(best.y - f.dy * scale), scale, dist: best.m.dist, margin: best.m.margin });
    }
    if (taken.length >= 14) break;
  }
  return hits.sort((a, b) => a.x - b.x);
}

/** Item-Spalte unter einem Porträt (nur sichtbar, solange Tab gedrückt ist). */
export function readTabColumn(r: Raster, p: PortraitHit, refs: VisionRefs): SlotReading[] | null {
  const t = GEO.tab, s = p.scale;
  const rects: Rect[] = [];
  for (let row = 0; row < t.maxRows; row++) for (let col = 0; col < t.cols; col++) {
    rects.push({ x: Math.round(p.x + (t.dx + col * t.pitchX) * s), y: Math.round(p.y + (t.dy + row * t.pitchY) * s), w: Math.round(t.size * s), h: Math.round(t.size * s) });
  }
  const inside = rects.filter((q) => q.y + q.h <= r.h);
  const tiles = readTiles(r, inside, refs, Math.max(1, Math.round(2 * s)));
  // Spalte gilt als sichtbar, wenn die erste Zeile belegt ist oder – bei 0 Items – nie; daher null = nicht erkennbar
  const filled = tiles.filter((x) => x.state !== 'empty');
  if (!filled.length) return null;
  // Nach der ersten komplett leeren Zeile abschneiden
  const out: SlotReading[] = [];
  for (let row = 0; row * t.cols < tiles.length; row++) {
    const rowTiles = tiles.slice(row * t.cols, row * t.cols + t.cols);
    if (rowTiles.every((x) => x.state === 'empty')) break;
    out.push(...rowTiles);
  }
  return out;
}

/** Prüft bekannte Porträtpositionen erneut (schnell, ohne Suche). Liefert nur weiterhin passende Treffer. */
export function verifyPortraits(r: Raster, refs: VisionRefs, known: PortraitHit[]): PortraitHit[] {
  const f = GEO.portrait.face;
  const out: PortraitHit[] = [];
  for (const p of known) {
    const rect = { x: p.x + f.dx * p.scale, y: p.y + f.dy * p.scale, w: f.w * p.scale, h: f.h * p.scale };
    const fp = fingerprint(r, rect, HERO_FP_N);
    if (spread(fp) < HERO_ACCEPT.minSpread) continue;
    const m = bestMatch(fp, refs.heroes, null);
    if (m && m.key === p.hero && m.dist <= HERO_ACCEPT.maxDist && m.secondDist - m.dist >= HERO_ACCEPT.minMargin) out.push({ ...p, dist: m.dist, margin: m.secondDist - m.dist });
  }
  return out;
}
