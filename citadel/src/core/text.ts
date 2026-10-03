// Text-Hilfen für verlustfreies Bearbeiten echter Config-Dateien:
// Encoding/BOM, Zeilenenden und Span-basierte Ersetzungen.

export type LineEnding = '\r\n' | '\n';

export interface DecodedText {
  text: string;
  /** Die Datei begann mit einem UTF-8-BOM; beim Speichern wird es wieder geschrieben. */
  bom: boolean;
  encoding: 'utf-8';
}

export class UnsupportedEncodingError extends Error {}

/** Dekodiert Dateiinhalt. Nur UTF-8 (mit/ohne BOM) wird bearbeitet; alles andere bleibt read-only. */
export function decodeBytes(bytes: Uint8Array): DecodedText {
  let bom = false;
  let body = bytes;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bom = true;
    body = bytes.subarray(3);
  } else if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    throw new UnsupportedEncodingError('UTF-16-Datei erkannt – wird nur angezeigt, nicht bearbeitet.');
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body);
    return { text, bom, encoding: 'utf-8' };
  } catch {
    throw new UnsupportedEncodingError('Datei ist kein gültiges UTF-8 – wird nicht bearbeitet, um Zeichen nicht zu beschädigen.');
  }
}

export function encodeText(d: { text: string; bom: boolean }): Uint8Array {
  const body = new TextEncoder().encode(d.text);
  if (!d.bom) return body;
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf]);
  out.set(body, 3);
  return out;
}

/** Überwiegendes Zeilenende der Datei (Standard: CRLF, wie von Windows-Tools erwartet, falls nicht bestimmbar). */
export function detectLineEnding(text: string, fallback: LineEnding = '\r\n'): LineEnding {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/\n/g) || []).length - crlf;
  if (crlf === 0 && lf === 0) return fallback;
  return crlf >= lf ? '\r\n' : '\n';
}

export interface TextEdit {
  start: number;
  end: number;
  replacement: string;
}

/** Wendet nicht überlappende Ersetzungen an. Überlappungen sind ein Programmierfehler. */
export function applyEdits(text: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let prevStart = Infinity;
  let out = text;
  for (const e of sorted) {
    if (e.end > prevStart) throw new Error(`Überlappende Änderungen bei Offset ${e.start}`);
    if (e.start < 0 || e.end > text.length || e.start > e.end) throw new Error('Ungültiger Änderungsbereich');
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
    prevStart = e.start;
  }
  return out;
}

export function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Einrückung der Zeile, in der `offset` liegt. */
export function indentAt(text: string, offset: number): string {
  let s = offset;
  while (s > 0 && text[s - 1] !== '\n') s--;
  let e = s;
  while (e < text.length && (text[e] === ' ' || text[e] === '\t')) e++;
  return text.slice(s, e);
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
