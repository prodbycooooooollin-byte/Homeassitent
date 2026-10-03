// Crosshair-Modell, Validierung, Konsolenbefehle, appinterne Share-Codes und ein
// reproduzierbarer SVG-Renderer (Annäherung – nicht mit dem Spiel abgeglichen).

import { toConsoleLine } from './cfg.ts';
import { SETTINGS, validateValue } from './catalog.ts';

export interface CrosshairParams {
  color: [number, number, number];
  outlineColor: [number, number, number];
  pipGap: number;
  pipGapStatic: boolean;
  pipHeight: number;
  pipWidth: number;
  pipOpacity: number;
  pipOutlineBorder: number;
  pipOutlineGap: number;
  pipOutlineOpacity: number;
  dotSize: number;
  dotOpacity: number;
  dotOutlineBorder: number;
  dotOutlineGap: number;
  dotOutlineOpacity: number;
  hitMarkerDuration: number;
  disableHeroSpecific: boolean;
}

/** Zuordnung Parameter ↔ ConVar (belegt durch die ConVar-Liste, siehe Katalog). */
export const CROSSHAIR_CONVARS: { field: keyof CrosshairParams; convar: string; index?: number }[] = [
  { field: 'color', convar: 'citadel_crosshair_color_r', index: 0 },
  { field: 'color', convar: 'citadel_crosshair_color_g', index: 1 },
  { field: 'color', convar: 'citadel_crosshair_color_b', index: 2 },
  { field: 'outlineColor', convar: 'citadel_crosshair_outline_color_r', index: 0 },
  { field: 'outlineColor', convar: 'citadel_crosshair_outline_color_g', index: 1 },
  { field: 'outlineColor', convar: 'citadel_crosshair_outline_color_b', index: 2 },
  { field: 'pipGap', convar: 'citadel_crosshair_pip_gap' },
  { field: 'pipGapStatic', convar: 'citadel_crosshair_pip_gap_static' },
  { field: 'pipHeight', convar: 'citadel_crosshair_pip_height' },
  { field: 'pipWidth', convar: 'citadel_crosshair_pip_width' },
  { field: 'pipOpacity', convar: 'citadel_crosshair_pip_opacity' },
  { field: 'pipOutlineBorder', convar: 'citadel_crosshair_pip_outline_border' },
  { field: 'pipOutlineGap', convar: 'citadel_crosshair_pip_outline_gap' },
  { field: 'pipOutlineOpacity', convar: 'citadel_crosshair_pip_outline_opacity' },
  { field: 'dotSize', convar: 'citadel_crosshair_dot_size' },
  { field: 'dotOpacity', convar: 'citadel_crosshair_dot_opacity' },
  { field: 'dotOutlineBorder', convar: 'citadel_crosshair_dot_outline_border' },
  { field: 'dotOutlineGap', convar: 'citadel_crosshair_dot_outline_gap' },
  { field: 'dotOutlineOpacity', convar: 'citadel_crosshair_dot_outline_opacity' },
  { field: 'hitMarkerDuration', convar: 'citadel_crosshair_hit_marker_duration' },
  { field: 'disableHeroSpecific', convar: 'citadel_crosshair_disable_hero_specific_crosshairs' },
];

export const CROSSHAIR_DEFAULTS: CrosshairParams = {
  color: [255, 255, 255],
  outlineColor: [0, 0, 0],
  pipGap: 4,
  pipGapStatic: false,
  pipHeight: 16,
  pipWidth: 2,
  pipOpacity: 0.5,
  pipOutlineBorder: 1,
  pipOutlineGap: 0,
  pipOutlineOpacity: 0.7,
  dotSize: 4,
  dotOpacity: 0.7,
  dotOutlineBorder: 2,
  dotOutlineGap: 0,
  dotOutlineOpacity: 0.7,
  hitMarkerDuration: 0.1,
  disableHeroSpecific: false,
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

export function toConvars(p: CrosshairParams): { name: string; value: string }[] {
  return CROSSHAIR_CONVARS.map((m) => {
    const v = p[m.field];
    if (Array.isArray(v)) return { name: m.convar, value: String(v[m.index!]) };
    if (typeof v === 'boolean') return { name: m.convar, value: v ? 'true' : 'false' };
    return { name: m.convar, value: fmt(v as number) };
  });
}

export function toSettingValues(p: CrosshairParams): Record<string, string> {
  return Object.fromEntries(toConvars(p).map((c) => [`cfg.${c.name}`, c.value]));
}

export function consoleCommand(p: CrosshairParams): string {
  return toConsoleLine(toConvars(p));
}

/** Liest Crosshair-Werte aus ConVar-Werten; fehlende Werte → Standard, aber als fehlend gemeldet. */
export function fromConvars(values: Map<string, string> | Record<string, string>): { params: CrosshairParams; missing: string[]; invalid: string[] } {
  const get = (k: string) => (values instanceof Map ? values.get(k) : values[k]);
  const params = structuredClone(CROSSHAIR_DEFAULTS);
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const m of CROSSHAIR_CONVARS) {
    const raw = get(m.convar);
    if (raw === undefined) {
      missing.push(m.convar);
      continue;
    }
    const def = SETTINGS.find((s) => s.key === m.convar)!;
    const v = validateValue(def, raw);
    if (!v.ok) {
      invalid.push(`${m.convar}: ${v.message}`);
      continue;
    }
    const target = params[m.field];
    if (Array.isArray(target)) target[m.index!] = Number(v.normalized);
    else if (typeof target === 'boolean') (params as unknown as Record<string, unknown>)[m.field] = v.normalized === 'true';
    else (params as unknown as Record<string, unknown>)[m.field] = Number(v.normalized);
  }
  return { params, missing, invalid };
}

/** Extrahiert citadel_crosshair_*-Befehle aus beliebigem Text (Konsolenzeile, cfg, Beschreibung). */
export function parseCrosshairCommands(text: string): Map<string, string> {
  const m = new Map<string, string>();
  const re = /\b(citadel_crosshair_[a-z_]+)\s*(?:"([^"\n]*)"|([^\s;"]+))/gi;
  let r: RegExpExecArray | null;
  while ((r = re.exec(text))) m.set(r[1].toLowerCase(), (r[2] ?? r[3]).trim());
  return m;
}

export function validateCrosshair(p: CrosshairParams): string[] {
  const errs: string[] = [];
  for (const c of toConvars(p)) {
    const def = SETTINGS.find((s) => s.key === c.name)!;
    const v = validateValue(def, c.value);
    if (!v.ok) errs.push(`${def.label}: ${v.message}`);
  }
  return errs;
}

// ---------------------------------------------------------------- Share-Codes

/** Appinterner Code. Kein offizieller Deadlock-Importcode. Format: CTDL1-<base64url(JSON)>-<crc> */
export const SHARE_PREFIX = 'CTDL1';

function crc32(str: string): number {
  let c = ~0;
  for (let i = 0; i < str.length; i++) {
    c ^= str.charCodeAt(i);
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeShareCode(p: CrosshairParams, name?: string): string {
  const compact = { v: 1, n: name?.slice(0, 40), c: Object.fromEntries(toConvars(p).map((x) => [x.name.replace('citadel_crosshair_', ''), x.value])) };
  const json = JSON.stringify(compact);
  return `${SHARE_PREFIX}-${b64url(json)}-${crc32(json).toString(36)}`;
}

export function decodeShareCode(code: string): { params: CrosshairParams; name?: string } {
  const m = /^CTDL1-([A-Za-z0-9_-]+)-([a-z0-9]+)$/.exec(code.trim());
  if (!m) throw new Error('Kein gültiger CITADEL-Crosshair-Code');
  if (m[1].length > 4000) throw new Error('Code zu lang');
  const json = unb64url(m[1]);
  if (crc32(json).toString(36) !== m[2]) throw new Error('Prüfsumme stimmt nicht – Code beschädigt');
  const o = JSON.parse(json) as { v: number; n?: string; c: Record<string, string> };
  if (o.v !== 1 || typeof o.c !== 'object') throw new Error('Unbekannte Code-Version');
  const vals: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.c)) {
    if (!/^[a-z_]+$/.test(k) || typeof v !== 'string') throw new Error('Ungültiger Eintrag im Code');
    vals[`citadel_crosshair_${k}`] = v;
  }
  const r = fromConvars(vals);
  if (r.invalid.length) throw new Error(`Ungültige Werte: ${r.invalid.join(', ')}`);
  return { params: r.params, name: typeof o.n === 'string' ? o.n.slice(0, 40) : undefined };
}

// ---------------------------------------------------------------- Renderer

export interface RenderOptions {
  size: number;
  /** Zusätzliche Spreizung (dynamischer Abstand), in Pixeln; 0 = ruhend. */
  spread?: number;
  scale?: number;
}

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;

/**
 * Erzeugt SVG-Markup. Annahmen (nicht mit dem Spiel abgeglichen):
 * vier Linien („pips“) oben/unten/links/rechts im Abstand pipGap zur Mitte, Breite pipWidth,
 * Länge pipHeight; Kontur als Rahmen der Stärke *_outline_border mit Abstand *_outline_gap;
 * Punkt als Kreis mit Durchmesser dotSize.
 */
export function renderSvg(p: CrosshairParams, o: RenderOptions): string {
  const s = o.scale ?? 1;
  const c = o.size / 2;
  const gap = (p.pipGap + (p.pipGapStatic ? 0 : o.spread ?? 0)) * s;
  const w = p.pipWidth * s;
  const h = p.pipHeight * s;
  const parts: string[] = [];
  const outline = (x: number, y: number, rw: number, rh: number) => {
    const b = p.pipOutlineBorder * s;
    const g = p.pipOutlineGap * s;
    if (b <= 0 || p.pipOutlineOpacity <= 0) return;
    const ox = x - g - b / 2;
    const oy = y - g - b / 2;
    parts.push(`<rect x="${ox}" y="${oy}" width="${rw + 2 * g + b}" height="${rh + 2 * g + b}" fill="none" stroke="${rgba(p.outlineColor, p.pipOutlineOpacity)}" stroke-width="${b}"/>`);
  };
  if (h > 0 && w > 0 && p.pipOpacity > 0) {
    const rects: [number, number, number, number][] = [
      [c - w / 2, c - gap - h, w, h], // oben
      [c - w / 2, c + gap, w, h], // unten
      [c - gap - h, c - w / 2, h, w], // links
      [c + gap, c - w / 2, h, w], // rechts
    ];
    for (const r of rects) outline(...r);
    for (const r of rects) parts.push(`<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" fill="${rgba(p.color, p.pipOpacity)}"/>`);
  }
  if (p.dotSize > 0 && p.dotOpacity > 0) {
    const r = (p.dotSize * s) / 2;
    const b = p.dotOutlineBorder * s;
    if (b > 0 && p.dotOutlineOpacity > 0) parts.push(`<circle cx="${c}" cy="${c}" r="${r + p.dotOutlineGap * s + b / 2}" fill="none" stroke="${rgba(p.outlineColor, p.dotOutlineOpacity)}" stroke-width="${b}"/>`);
    parts.push(`<circle cx="${c}" cy="${c}" r="${r}" fill="${rgba(p.color, p.dotOpacity)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.size}" height="${o.size}" viewBox="0 0 ${o.size} ${o.size}" shape-rendering="crispEdges">${parts.join('')}</svg>`;
}

// ---------------------------------------------------------------- Presets

export type CrosshairKind = 'punkt' | 'kreuz' | 'kreuz+punkt' | 'minimal' | 'gross';

export interface CrosshairPreset {
  id: string;
  name: string;
  kind: CrosshairKind;
  colorName: string;
  size: 'klein' | 'mittel' | 'gross';
  author: string;
  /** own = eigenes CITADEL-Preset, community = Beitrag, player = belegtes Spieler-Crosshair. */
  origin: 'own' | 'community' | 'player';
  createdAt: string;
  catalogVersion: string;
  params: CrosshairParams;
  description: string;
  sourceUrl?: string;
}

const COLORS: Record<string, [number, number, number]> = {
  Weiß: [255, 255, 255],
  Cyan: [0, 255, 255],
  Grün: [0, 255, 0],
  Gelb: [255, 255, 0],
  Magenta: [255, 0, 255],
  Rot: [255, 40, 40],
  Orange: [255, 150, 0],
  Jade: [70, 220, 170],
  Pink: [255, 110, 200],
  Hellblau: [110, 190, 255],
};

function preset(id: string, name: string, colorName: keyof typeof COLORS, over: Partial<CrosshairParams>, description: string): CrosshairPreset {
  const params: CrosshairParams = { ...structuredClone(CROSSHAIR_DEFAULTS), color: COLORS[colorName], ...over };
  const hasPips = params.pipHeight > 0 && params.pipOpacity > 0;
  const hasDot = params.dotSize > 0 && params.dotOpacity > 0;
  const kind: CrosshairKind = hasPips && hasDot ? 'kreuz+punkt' : hasPips ? (params.pipHeight >= 14 ? 'gross' : params.pipHeight <= 4 ? 'minimal' : 'kreuz') : 'punkt';
  const extent = hasPips ? params.pipGap + params.pipHeight : params.dotSize / 2;
  const size = extent <= 6 ? 'klein' : extent <= 13 ? 'mittel' : 'gross';
  return { id, name, kind, colorName, size, author: 'CITADEL', origin: 'own', createdAt: '2026-09-30', catalogVersion: '2026.09.30-1', params, description };
}

const noDot = { dotSize: 0, dotOpacity: 0, dotOutlineBorder: 0 };
const noPips = { pipHeight: 0, pipOpacity: 0, pipOutlineBorder: 0 };
const solid = { pipOpacity: 1, pipOutlineOpacity: 1, dotOpacity: 1, dotOutlineOpacity: 1 };

export const OWN_PRESETS: CrosshairPreset[] = [
  preset('ctdl-precision-dot', 'Präzisionspunkt', 'Cyan', { ...noPips, dotSize: 3, dotOpacity: 1, dotOutlineBorder: 1, dotOutlineOpacity: 1 }, 'Kleiner, voll deckender Punkt mit dünner Kontur.'),
  preset('ctdl-dot-white', 'Weißer Punkt', 'Weiß', { ...noPips, dotSize: 4, dotOpacity: 1, dotOutlineBorder: 1.5, dotOutlineOpacity: 1 }, 'Neutraler Punkt, gut auf dunklen Karten.'),
  preset('ctdl-dot-large', 'Großer Punkt', 'Gelb', { ...noPips, dotSize: 7, dotOpacity: 0.9, dotOutlineBorder: 2, dotOutlineOpacity: 0.9 }, 'Gut sichtbar bei hohen Auflösungen.'),
  preset('ctdl-dot-soft', 'Weicher Punkt', 'Jade', { ...noPips, dotSize: 5, dotOpacity: 0.6, dotOutlineBorder: 0 }, 'Halbtransparent, drängt sich nicht auf.'),
  preset('ctdl-classic', 'Klassisch', 'Grün', { ...solid, ...noDot, pipGap: 4, pipHeight: 8, pipWidth: 2, pipOutlineBorder: 1 }, 'Vier Linien, statischer Eindruck, klare Mitte.'),
  preset('ctdl-classic-dot', 'Klassisch + Punkt', 'Grün', { ...solid, pipGap: 5, pipHeight: 8, pipWidth: 2, dotSize: 2, dotOutlineBorder: 1 }, 'Klassisches Kreuz mit kleinem Zentrumspunkt.'),
  preset('ctdl-tight-cyan', 'Eng Cyan', 'Cyan', { ...solid, ...noDot, pipGap: 2, pipHeight: 5, pipWidth: 2, pipOutlineBorder: 1 }, 'Kompaktes Kreuz für präzises Zielen.'),
  preset('ctdl-tight-static', 'Eng statisch', 'Weiß', { ...solid, ...noDot, pipGap: 3, pipGapStatic: true, pipHeight: 6, pipWidth: 1.5 }, 'Fester Abstand – ändert sich nicht mit der Streuung (laut ConVar-Name).'),
  preset('ctdl-open-wide', 'Offen & weit', 'Gelb', { ...solid, ...noDot, pipGap: 10, pipHeight: 8, pipWidth: 2 }, 'Große Mitte für Helden mit breiter Streuung.'),
  preset('ctdl-hairline', 'Haarlinie', 'Weiß', { ...noDot, pipGap: 4, pipHeight: 10, pipWidth: 1, pipOpacity: 0.9, pipOutlineBorder: 0 }, 'Sehr dünne Linien ohne Kontur.'),
  preset('ctdl-hairline-dot', 'Haarlinie + Punkt', 'Cyan', { pipGap: 5, pipHeight: 10, pipWidth: 1, pipOpacity: 0.9, pipOutlineBorder: 0, dotSize: 2, dotOpacity: 1, dotOutlineBorder: 0 }, 'Filigran mit Zentrum.'),
  preset('ctdl-bold', 'Kräftig', 'Magenta', { ...solid, ...noDot, pipGap: 4, pipHeight: 9, pipWidth: 3, pipOutlineBorder: 1.5 }, 'Dicke Linien mit deutlicher Kontur.'),
  preset('ctdl-bold-yellow', 'Kräftig Gelb', 'Gelb', { ...solid, ...noDot, pipGap: 4, pipHeight: 9, pipWidth: 3, pipOutlineBorder: 1.5 }, 'Hoher Kontrast auf dunklem Hintergrund.'),
  preset('ctdl-micro', 'Mikro', 'Grün', { ...solid, ...noDot, pipGap: 1.5, pipHeight: 3, pipWidth: 1.5, pipOutlineBorder: 1 }, 'Winziges Kreuz, fast ein Punkt.'),
  preset('ctdl-micro-dot', 'Mikro + Punkt', 'Weiß', { ...solid, pipGap: 2.5, pipHeight: 3, pipWidth: 1.5, pipOutlineBorder: 1, dotSize: 1.5, dotOutlineBorder: 1 }, 'Kompakt mit markierter Mitte.'),
  preset('ctdl-default-plus', 'Standard, deckend', 'Weiß', { pipOpacity: 1, dotOpacity: 1 }, 'Spielstandard, aber voll deckend.'),
  preset('ctdl-ghost', 'Geist', 'Weiß', { pipOpacity: 0.35, dotOpacity: 0.5, pipOutlineBorder: 0, dotOutlineBorder: 0 }, 'Sehr zurückhaltend, für Spieler, die kaum Crosshair möchten.'),
  preset('ctdl-red-alert', 'Signalrot', 'Rot', { ...solid, ...noDot, pipGap: 4, pipHeight: 7, pipWidth: 2, pipOutlineBorder: 1 }, 'Rot mit schwarzer Kontur; auf rötlichen Effekten ggf. schwer sichtbar.'),
  preset('ctdl-orange-dot', 'Oranger Punkt', 'Orange', { ...noPips, dotSize: 4, dotOpacity: 1, dotOutlineBorder: 1, dotOutlineOpacity: 1 }, 'Warmer Punkt, kontrastreich zu kühlen Szenen.'),
  preset('ctdl-pink-cross', 'Pink Kreuz', 'Pink', { ...solid, ...noDot, pipGap: 3, pipHeight: 7, pipWidth: 2 }, 'Auffällig, selten im Spiel vorkommende Farbe.'),
  preset('ctdl-ice', 'Eisblau', 'Hellblau', { ...solid, pipGap: 4, pipHeight: 7, pipWidth: 2, dotSize: 2 }, 'Kühles Blau mit Punkt.'),
  preset('ctdl-jade-sig', 'Jade Signatur', 'Jade', { ...solid, pipGap: 4, pipHeight: 6, pipWidth: 2, dotSize: 2, pipOutlineBorder: 1, dotOutlineBorder: 1 }, 'Das CITADEL-Hausdesign.'),
  preset('ctdl-long-thin', 'Lang & dünn', 'Grün', { ...noDot, pipGap: 6, pipHeight: 16, pipWidth: 1, pipOpacity: 1, pipOutlineBorder: 1 }, 'Lange Linien helfen beim Ausrichten auf Distanz.'),
  preset('ctdl-long-cyan', 'Lang Cyan', 'Cyan', { ...noDot, pipGap: 6, pipHeight: 14, pipWidth: 2, pipOpacity: 0.9, pipOutlineBorder: 1 }, 'Groß, gut für Nahkampf-Helden mit Streuung.'),
  preset('ctdl-no-outline', 'Ohne Kontur', 'Gelb', { ...noDot, pipGap: 4, pipHeight: 7, pipWidth: 2, pipOpacity: 1, pipOutlineBorder: 0 }, 'Keine Kontur – wirkt schlanker.'),
  preset('ctdl-thick-outline', 'Starke Kontur', 'Weiß', { ...solid, ...noDot, pipGap: 4, pipHeight: 7, pipWidth: 2, pipOutlineBorder: 2.5 }, 'Auf hellen Hintergründen besser lesbar.'),
  preset('ctdl-circle-dot', 'Ring-Punkt', 'Weiß', { ...noPips, dotSize: 6, dotOpacity: 0.15, dotOutlineBorder: 1.5, dotOutlineOpacity: 1, outlineColor: [255, 255, 255] }, 'Punkt mit heller Kontur – wirkt wie ein kleiner Ring (Annäherung).'),
  preset('ctdl-hitmarker-off', 'Ohne Treffermarker', 'Cyan', { ...solid, pipGap: 4, pipHeight: 6, pipWidth: 2, dotSize: 2, hitMarkerDuration: 0 }, 'Setzt die Trefferanzeige-Dauer auf 0.'),
  preset('ctdl-hero-override', 'Einheitlich (ohne Helden-Reticles)', 'Grün', { ...solid, pipGap: 4, pipHeight: 7, pipWidth: 2, dotSize: 2, disableHeroSpecific: true }, 'Gleiches Crosshair für alle Helden (laut ConVar-Name).'),
  preset('ctdl-minimal-t', 'Minimal Gelb', 'Gelb', { ...noDot, pipGap: 2, pipHeight: 3, pipWidth: 1, pipOpacity: 1, pipOutlineBorder: 1, pipOutlineOpacity: 1 }, 'Sehr kleines Kreuz mit Kontur.'),
  preset('ctdl-soft-green', 'Sanftes Grün', 'Grün', { pipGap: 5, pipHeight: 8, pipWidth: 2, pipOpacity: 0.6, dotSize: 3, dotOpacity: 0.6, pipOutlineBorder: 0, dotOutlineBorder: 0 }, 'Halbtransparentes Kreuz mit Punkt.'),
  preset('ctdl-magenta-dot', 'Magenta-Punkt', 'Magenta', { ...noPips, dotSize: 3.5, dotOpacity: 1, dotOutlineBorder: 1, dotOutlineOpacity: 1 }, 'Magenta ist in Deadlocks Farbpalette selten.'),
  preset('ctdl-wide-dot', 'Weit + Punkt', 'Weiß', { ...solid, pipGap: 9, pipHeight: 6, pipWidth: 2, dotSize: 2.5 }, 'Weite Linien umrahmen einen Punkt.'),
  preset('ctdl-square', 'Kompakt Quadrat', 'Cyan', { ...solid, ...noDot, pipGap: 0, pipHeight: 4, pipWidth: 4, pipOutlineBorder: 1 }, 'Linien ohne Abstand bilden ein kleines Kreuz-Quadrat.'),
];
