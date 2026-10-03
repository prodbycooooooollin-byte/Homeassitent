// Verlustfreier Parser für Konsolen-Configs (autoexec.cfg u. ä.).
// Jede Zeile kann mehrere durch ";" getrennte Befehle enthalten; "//" leitet einen Kommentar ein.
// Wirksam ist bei mehrfach gesetzten ConVars der zuletzt ausgeführte Befehl.

import { applyEdits, detectLineEnding, type TextEdit } from './text.ts';

export interface CfgCommand {
  name: string;
  args: string[];
  /** Span der Argumente (für Ersetzungen). Bei fehlenden Argumenten: Position direkt hinter dem Namen. */
  argsStart: number;
  argsEnd: number;
  start: number;
  end: number;
  line: number;
  /** true, wenn das erste Argument in Anführungszeichen stand. */
  quoted: boolean;
}

export interface CfgDocument {
  text: string;
  commands: CfgCommand[];
}

export function parseCfg(text: string): CfgDocument {
  const commands: CfgCommand[] = [];
  let line = 1;
  let i = 0;
  const n = text.length;
  while (i < n) {
    // Zeile [i, le)
    let le = text.indexOf('\n', i);
    if (le < 0) le = n;
    let j = i;
    while (j < le) {
      // ein Befehl bis ';' oder Kommentar oder Zeilenende
      while (j < le && (text[j] === ' ' || text[j] === '\t' || text[j] === '\r' || text[j] === ';')) j++;
      if (j >= le) break;
      if (text[j] === '/' && text[j + 1] === '/') break;
      const cmdStart = j;
      const toks: { v: string; s: number; e: number; q: boolean }[] = [];
      while (j < le && text[j] !== ';' && text[j] !== '\r') {
        if (text[j] === ' ' || text[j] === '\t') {
          j++;
          continue;
        }
        if (text[j] === '/' && text[j + 1] === '/') break;
        if (text[j] === '"') {
          const s = j;
          j++;
          while (j < le && text[j] !== '"') j++;
          const v = text.slice(s + 1, j);
          if (text[j] === '"') j++;
          toks.push({ v, s, e: j, q: true });
        } else {
          const s = j;
          while (j < le && !/[\s;"]/.test(text[j]) && !(text[j] === '/' && text[j + 1] === '/')) j++;
          toks.push({ v: text.slice(s, j), s, e: j, q: false });
        }
      }
      if (toks.length) {
        const [name, ...args] = toks;
        commands.push({
          name: name.v,
          args: args.map((a) => a.v),
          argsStart: args.length ? args[0].s : name.e,
          argsEnd: args.length ? args[args.length - 1].e : name.e,
          start: cmdStart,
          end: toks[toks.length - 1].e,
          line,
          quoted: args[0]?.q ?? false,
        });
      }
      if (text[j] === '/' && text[j + 1] === '/') break;
    }
    i = le + 1;
    line++;
  }
  return { text, commands };
}

/** Wirksame ConVar-Werte: letzter Befehl gewinnt. Schlüssel in Kleinbuchstaben. */
export function effectiveConvars(doc: CfgDocument): Map<string, CfgCommand> {
  const m = new Map<string, CfgCommand>();
  for (const c of doc.commands) {
    if (c.args.length >= 1 && !NON_CONVAR_COMMANDS.has(c.name.toLowerCase())) m.set(c.name.toLowerCase(), c);
  }
  return m;
}

export const NON_CONVAR_COMMANDS = new Set(['bind', 'unbind', 'alias', 'exec', 'echo', 'toggle', 'incrementvar', 'unbindall', 'host_writeconfig']);

export interface CfgBinding {
  key: string;
  command: string;
  line: number;
}

export function bindings(doc: CfgDocument): Map<string, CfgBinding> {
  const m = new Map<string, CfgBinding>();
  for (const c of doc.commands) {
    const nm = c.name.toLowerCase();
    if (nm === 'bind' && c.args.length >= 2) m.set(c.args[0].toLowerCase(), { key: c.args[0], command: c.args.slice(1).join(' '), line: c.line });
    if (nm === 'unbind' && c.args.length >= 1) m.delete(c.args[0].toLowerCase());
    if (nm === 'unbindall') m.clear();
  }
  return m;
}

export interface CfgDuplicate {
  name: string;
  lines: number[];
  values: string[];
}

export function cfgDuplicates(doc: CfgDocument): CfgDuplicate[] {
  const map = new Map<string, CfgCommand[]>();
  for (const c of doc.commands) {
    if (NON_CONVAR_COMMANDS.has(c.name.toLowerCase()) || c.args.length === 0) continue;
    const k = c.name.toLowerCase();
    map.set(k, [...(map.get(k) || []), c]);
  }
  return [...map.values()].filter((l) => l.length > 1).map((l) => ({ name: l[0].name, lines: l.map((c) => c.line), values: l.map((c) => c.args.join(' ')) }));
}

export const MANAGED_BEGIN = '// >>> CITADEL';
export const MANAGED_END = '// <<< CITADEL';

function fmtValue(v: string, quoted: boolean): string {
  return quoted || /\s/.test(v) || v === '' ? `"${v}"` : v;
}

/**
 * Setzt ConVars in einer cfg-Datei.
 * - Existiert die ConVar bereits, wird nur das Argument des wirksamen (letzten) Befehls ersetzt –
 *   so bleibt die Ausführungsreihenfolge unverändert.
 * - Neue ConVars kommen in einen klar markierten CITADEL-Abschnitt am Dateiende.
 * - value === null entfernt den wirksamen Befehl nur, wenn er im CITADEL-Abschnitt steht; fremde Zeilen
 *   werden nie gelöscht, sondern auskommentiert.
 */
export function setConvars(doc: CfgDocument, sets: { name: string; value: string | null }[], section = 'Einstellungen'): string {
  const text = doc.text;
  const eol = detectLineEnding(text);
  const eff = effectiveConvars(doc);
  const edits: TextEdit[] = [];
  const append: string[] = [];
  for (const s of sets) {
    const c = eff.get(s.name.toLowerCase());
    if (s.value === null) {
      if (!c) continue;
      edits.push({ start: c.start, end: c.end, replacement: `// (von CITADEL deaktiviert) ${text.slice(c.start, c.end)}` });
      continue;
    }
    if (c) {
      edits.push({ start: c.argsStart, end: c.argsEnd, replacement: (c.args.length ? '' : ' ') + fmtValue(s.value, c.quoted) });
    } else {
      append.push(`${s.name} "${s.value}"`);
    }
  }
  let out = applyEdits(text, edits);
  if (append.length) {
    const begin = `${MANAGED_BEGIN} ${section}`;
    const bi = out.indexOf(begin);
    if (bi >= 0) {
      const ei = out.indexOf(MANAGED_END, bi);
      const insertAt = ei >= 0 ? ei : out.length;
      out = out.slice(0, insertAt) + append.join(eol) + eol + out.slice(insertAt);
    } else {
      const needsNl = out.length > 0 && !out.endsWith('\n');
      out += (needsNl ? eol : '') + `${begin} (von CITADEL verwaltet)${eol}${append.join(eol)}${eol}${MANAGED_END} ${section}${eol}`;
    }
  }
  return out;
}

/** Erzeugt eine einzeilige Konsoleneingabe aus ConVar-Werten. */
export function toConsoleLine(values: { name: string; value: string }[]): string {
  return values.map((v) => `${v.name} ${fmtValue(v.value, /[^\w.-]/.test(v.value))}`).join('; ');
}
