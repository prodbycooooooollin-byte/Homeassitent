// Verlustfreier Parser für Valve-KeyValues (KV1), wie er in Deadlocks `video.txt`
// ("video.cfg" { ... }) und `gameinfo.gi` vorkommt.
//
// Prinzip: Der Parser baut einen Baum mit exakten Zeichen-Spans der Originaldatei.
// Änderungen werden als Span-Ersetzungen angewendet – Kommentare, Einrückung,
// Leerzeilen, Zeilenenden und unbekannte Einträge bleiben Byte für Byte erhalten.

import { applyEdits, detectLineEnding, indentAt, lineOf, type TextEdit } from './text.ts';

export interface KvToken {
  kind: 'quoted' | 'bare' | 'open' | 'close' | 'cond';
  /** Wert ohne Anführungszeichen. */
  value: string;
  start: number;
  end: number;
}

export interface KvNode {
  key: string;
  keyTok: KvToken;
  /** Skalarer Wert (Blatt). */
  valueTok?: KvToken;
  /** Unterknoten (Block). */
  children?: KvNode[];
  openTok?: KvToken;
  closeTok?: KvToken;
  /** Plattform-Bedingung wie [$WIN64] – wird unverändert erhalten. */
  cond?: string;
  line: number;
}

export interface KvParseIssue {
  message: string;
  line: number;
}

export interface KvDocument {
  text: string;
  nodes: KvNode[];
  issues: KvParseIssue[];
}

function tokenize(text: string, issues: KvParseIssue[]): KvToken[] {
  const toks: KvToken[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '﻿') {
      i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === '{') {
      toks.push({ kind: 'open', value: '{', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '}') {
      toks.push({ kind: 'close', value: '}', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '"') {
      const start = i;
      i++;
      let v = '';
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && (text[i + 1] === '"' || text[i + 1] === '\\')) {
          v += text[i + 1];
          i += 2;
          continue;
        }
        if (text[i] === '\n') break; // unterminierter String: am Zeilenende abbrechen
        v += text[i];
        i++;
      }
      if (text[i] !== '"') issues.push({ message: 'Nicht geschlossenes Anführungszeichen', line: lineOf(text, start) });
      else i++;
      toks.push({ kind: 'quoted', value: v, start, end: i });
      continue;
    }
    if (c === '[') {
      const start = i;
      while (i < n && text[i] !== ']' && text[i] !== '\n') i++;
      if (text[i] === ']') i++;
      toks.push({ kind: 'cond', value: text.slice(start, i), start, end: i });
      continue;
    }
    const start = i;
    while (i < n && !/[\s{}"]/.test(text[i]) && !(text[i] === '/' && text[i + 1] === '/')) i++;
    toks.push({ kind: 'bare', value: text.slice(start, i), start, end: i });
  }
  return toks;
}

export function parseKv(text: string): KvDocument {
  const issues: KvParseIssue[] = [];
  const toks = tokenize(text, issues);
  let p = 0;

  function parseList(depth: number): KvNode[] {
    const out: KvNode[] = [];
    while (p < toks.length) {
      const t = toks[p];
      if (t.kind === 'close') {
        if (depth === 0) {
          issues.push({ message: 'Überzählige schließende Klammer', line: lineOf(text, t.start) });
          p++;
          continue;
        }
        return out;
      }
      if (t.kind === 'open') {
        issues.push({ message: 'Block ohne Schlüssel', line: lineOf(text, t.start) });
        p++;
        continue;
      }
      if (t.kind === 'cond') {
        p++;
        continue;
      }
      p++;
      const node: KvNode = { key: t.value, keyTok: t, line: lineOf(text, t.start) };
      const nx = toks[p];
      if (!nx) {
        issues.push({ message: `Schlüssel "${t.value}" ohne Wert`, line: node.line });
        out.push(node);
        break;
      }
      if (nx.kind === 'open') {
        node.openTok = nx;
        p++;
        node.children = parseList(depth + 1);
        const cl = toks[p];
        if (cl && cl.kind === 'close') {
          node.closeTok = cl;
          p++;
        } else {
          issues.push({ message: `Block "${t.value}" nicht geschlossen`, line: node.line });
        }
      } else if (nx.kind === 'quoted' || nx.kind === 'bare') {
        node.valueTok = nx;
        p++;
      } else if (nx.kind === 'close') {
        issues.push({ message: `Schlüssel "${t.value}" ohne Wert`, line: node.line });
      }
      if (toks[p]?.kind === 'cond') {
        node.cond = toks[p].value;
        p++;
      }
      out.push(node);
    }
    if (depth > 0) return out;
    return out;
  }

  const nodes = parseList(0);
  return { text, nodes, issues };
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Alle Knoten unter einem Pfad (Groß-/Kleinschreibung wird wie in Source 2 ignoriert). */
export function findAll(nodes: KvNode[], path: string[]): KvNode[] {
  if (path.length === 0) return [];
  const [head, ...rest] = path;
  const hits = nodes.filter((n) => eq(n.key, head));
  if (rest.length === 0) return hits;
  return hits.flatMap((h) => (h.children ? findAll(h.children, rest) : []));
}

export function findBlock(nodes: KvNode[], path: string[]): KvNode | undefined {
  const all = findAll(nodes, path).filter((n) => n.children);
  return all[all.length - 1];
}

/** Wirksamer Knoten: der letzte gleichnamige Eintrag (spätere überschreiben frühere). */
export function effective(nodes: KvNode[], key: string): KvNode | undefined {
  const hits = nodes.filter((n) => eq(n.key, key) && n.valueTok);
  return hits[hits.length - 1];
}

export interface KvDuplicate {
  key: string;
  lines: number[];
  values: string[];
}

export function duplicates(nodes: KvNode[]): KvDuplicate[] {
  const map = new Map<string, KvNode[]>();
  for (const n of nodes) {
    if (!n.valueTok) continue;
    const k = n.key.toLowerCase();
    map.set(k, [...(map.get(k) || []), n]);
  }
  return [...map.values()]
    .filter((l) => l.length > 1)
    .map((l) => ({ key: l[0].key, lines: l.map((n) => n.line), values: l.map((n) => n.valueTok!.value) }));
}

function quoteLike(tok: KvToken | undefined, value: string): string {
  if (tok && tok.kind === 'bare' && /^[^\s{}"]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export interface KvSet {
  /** Pfad des Blocks, z. B. ['video.cfg'] oder ['GameInfo', 'ConVars']. Leer = oberste Ebene. */
  block: string[];
  key: string;
  /** null = Eintrag entfernen. */
  value: string | null;
}

/**
 * Wendet Wertänderungen an und gibt den neuen Text zurück.
 * - Vorhandener Schlüssel: nur der Wert-Token des wirksamen (letzten) Eintrags wird ersetzt.
 * - Fehlender Schlüssel: neue Zeile vor der schließenden Klammer, im Stil der Geschwister.
 * - Entfernen: die ganze Zeile des Eintrags wird entfernt (nur wenn sie nichts anderes enthält).
 */
export function setValues(doc: KvDocument, sets: KvSet[]): string {
  const text = doc.text;
  const eol = detectLineEnding(text);
  const edits: TextEdit[] = [];
  const inserts = new Map<number, string[]>();

  for (const s of sets) {
    const list = s.block.length === 0 ? doc.nodes : findBlock(doc.nodes, s.block)?.children;
    const blockNode = s.block.length === 0 ? undefined : findBlock(doc.nodes, s.block);
    if (!list) throw new Error(`Block ${s.block.join('/')} nicht gefunden`);
    const eff = effective(list, s.key);
    if (s.value === null) {
      if (!eff) continue;
      let ls = eff.keyTok.start;
      while (ls > 0 && text[ls - 1] !== '\n') ls--;
      let le = eff.valueTok!.end;
      while (le < text.length && text[le] !== '\n') le++;
      const lineText = text.slice(ls, le);
      const rest = text.slice(eff.valueTok!.end, le).trim();
      if (text.slice(ls, eff.keyTok.start).trim() === '' && (rest === '' || rest.startsWith('//'))) {
        edits.push({ start: ls, end: Math.min(le + 1, text.length), replacement: '' });
      } else {
        throw new Error(`Eintrag ${s.key} teilt sich eine Zeile mit anderem Inhalt: ${lineText.trim()}`);
      }
      continue;
    }
    if (eff) {
      edits.push({ start: eff.valueTok!.start, end: eff.valueTok!.end, replacement: quoteLike(eff.valueTok, s.value) });
      continue;
    }
    // Neuer Eintrag: Stil vom letzten Geschwister-Blatt übernehmen.
    const sibling = [...list].reverse().find((n) => n.valueTok);
    let indent: string;
    let sep = '\t\t';
    let keyStr = `"${s.key}"`;
    let valStr = `"${s.value}"`;
    if (sibling) {
      indent = indentAt(text, sibling.keyTok.start);
      sep = text.slice(sibling.keyTok.end, sibling.valueTok!.start) || '\t\t';
      if (sep.includes('\n')) sep = '\t\t';
      keyStr = sibling.keyTok.kind === 'bare' ? s.key : `"${s.key}"`;
      valStr = quoteLike(sibling.valueTok, s.value);
    } else if (blockNode) {
      indent = indentAt(text, blockNode.keyTok.start) + '\t';
    } else {
      indent = '';
    }
    const line = `${indent}${keyStr}${sep}${valStr}`;
    let at: number;
    if (blockNode?.closeTok) {
      at = blockNode.closeTok.start;
      while (at > 0 && (text[at - 1] === ' ' || text[at - 1] === '\t')) at--;
    } else {
      at = text.length;
    }
    inserts.set(at, [...(inserts.get(at) || []), line]);
  }

  for (const [at, lines] of inserts) {
    // Einfügen am Zeilenanfang vor der schließenden Klammer.
    const atLineStart = at === 0 || text[at - 1] === '\n';
    const prefix = atLineStart ? '' : eol;
    edits.push({ start: at, end: at, replacement: prefix + lines.join(eol) + eol });
  }
  return applyEdits(text, edits);
}

/** Flache Sicht auf die Blätter eines Blocks: wirksamer Wert je Schlüssel (letzter gewinnt). */
export function leafMap(nodes: KvNode[] | undefined): Map<string, { key: string; value: string; line: number }> {
  const m = new Map<string, { key: string; value: string; line: number }>();
  for (const n of nodes || []) {
    if (n.valueTok) m.set(n.key.toLowerCase(), { key: n.key, value: n.valueTok.value, line: n.line });
  }
  return m;
}
