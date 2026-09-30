// Regelbasierte Extraktion (ohne Sprachmodell) aus Text, cfg-Inhalten und HTML.
// Liefert nur Werte mit wörtlicher Fundstelle. Mehrdeutige Treffer werden als „unklar“ markiert, nie geraten.

import { parseCrosshairCommands } from '../../src/core/crosshair.ts';
import type { Candidate } from '../pipeline/validate.ts';

export const EXTRACTOR_VERSION = 'rules-1';

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|p|div|li|tr|h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function snippet(text: string, idx: number, len: number): string {
  const s = Math.max(0, idx - 50);
  const e = Math.min(text.length, idx + len + 50);
  return text.slice(s, e).replace(/\s+/g, ' ').trim();
}

/** Nennt der Text Deadlock ausdrücklich? */
export function mentionsDeadlock(text: string): boolean {
  return /\bdeadlock\b/i.test(text) || /citadel_crosshair_|citadel_camera_hero_fov/i.test(text);
}

interface Hit {
  value: string;
  idx: number;
  len: number;
}

function collect(text: string, re: RegExp, group = 1, map?: (m: RegExpExecArray) => string): Hit[] {
  const out: Hit[] = [];
  let m: RegExpExecArray | null;
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = g.exec(text))) out.push({ value: map ? map(m) : m[group], idx: m.index, len: m[0].length });
  return out;
}

function single(field: string, hits: Hit[], text: string, gameConfirmed: boolean, extra: Partial<Candidate> = {}): Candidate[] {
  if (!hits.length) return [];
  const distinct = [...new Set(hits.map((h) => h.value))];
  const h = hits[hits.length - 1];
  if (distinct.length > 1) {
    // Mehrere widersprüchliche Angaben im selben Dokument: nicht raten.
    return [{ field, value: h.value, evidence: `Mehrdeutig (${distinct.join(' / ')}): ${snippet(text, h.idx, h.len)}`, gameConfirmed: false, ...extra }];
  }
  return [{ field, value: h.value, evidence: snippet(text, h.idx, h.len), gameConfirmed, ...extra }];
}

/**
 * @param text  Klartext (bei HTML vorher htmlToText)
 * @param opts.isConfigFile  Inhalt ist eine Deadlock-Config-Datei (Spielbezug durch Dateityp belegt)
 */
export function extractByRules(text: string, opts: { isConfigFile?: boolean; publishedAt?: string | null } = {}): Candidate[] {
  const game = Boolean(opts.isConfigFile) || mentionsDeadlock(text);
  const pub = { publishedAt: opts.publishedAt ?? null };
  const out: Candidate[] = [];

  const ch = parseCrosshairCommands(text);
  if (ch.size) {
    const first = text.search(/citadel_crosshair_/i);
    out.push({ field: 'crosshair', value: JSON.stringify(Object.fromEntries(ch)), evidence: snippet(text, first, 200), gameConfirmed: true, ...pub });
  }

  // Konsolenform (cfg) – eindeutig durch ConVar-Namen
  out.push(...single('sensitivity', collect(text, /(?:^|[\s;])sensitivity\s+"?(\d+(?:[.,]\d+)?)"?/im), text, game, pub));
  out.push(...single('zoom_sensitivity_ratio', collect(text, /zoom_sensitivity_ratio\s+"?(\d+(?:\.\d+)?)"?/i), text, game, pub));
  out.push(...single('fov', collect(text, /citadel_camera_hero_fov\s+"?(\d+(?:\.\d+)?)"?/i), text, true, { context: 'citadel_camera_hero_fov', ...pub }));

  if (!opts.isConfigFile) {
    // Beschriftete Angaben in Fließtext
    const sensLabeled = collect(text, /\b(?:in-?game\s+)?sens(?:itivity)?\s*[:=]\s*(\d+(?:[.,]\d+)?)\b/i);
    if (!out.some((c) => c.field === 'sensitivity')) out.push(...single('sensitivity', sensLabeled.map((h) => ({ ...h, value: h.value.replace(',', '.') })), text, game, pub));
    out.push(...single('dpi', [...collect(text, /\bDPI\s*[:=]\s*(\d{2,5})\b/i), ...collect(text, /\b(\d{3,5})\s*DPI\b/i)], text, game, pub));
    out.push(...single('resolution', collect(text, /\bresolution\s*[:=]\s*(\d{3,5}\s*[x×]\s*\d{3,5})/i, 1, (m) => m[1].replace(/\s/g, '').replace('×', 'x')), text, game, pub));
  }
  return out;
}
