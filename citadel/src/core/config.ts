// Config-Modell: Formular- und Textansicht arbeiten auf demselben Entwurfstext je Datei.
// Formularänderungen werden als Span-Ersetzungen in den Entwurfstext geschrieben,
// Textänderungen werden semantisch zurückgelesen. Unbekannte Inhalte bleiben immer erhalten.

import { effectiveConvars, parseCfg, setConvars, bindings, cfgDuplicates, NON_CONVAR_COMMANDS } from './cfg.ts';
import {
  findSetting,
  formatLike,
  SETTINGS,
  SETTINGS_BY_ID,
  validateValue,
  VIDEO_DEVICE_KEYS,
  type ConfigFileKind,
  type SettingDefinition,
  type SettingGroup,
} from './catalog.ts';
import { lineDiff } from './diff.ts';
import { duplicates, findBlock, leafMap, parseKv, setValues, type KvDocument, type KvNode } from './kv.ts';

export interface LoadedFile {
  kind: ConfigFileKind;
  /** Anzeigepfad (lokal) oder Dateiname (Import). */
  path: string;
  text: string;
  bom: boolean;
  /** SHA-256 der Rohbytes beim Einlesen – Grundlage der Konfliktprüfung vor dem Schreiben. */
  sha256: string;
  readAt: string;
  exists: boolean;
}

export type Draft = Partial<Record<ConfigFileKind, string>>;

// ---------------------------------------------------------------- Werte lesen

export interface ValueEntry {
  key: string;
  value: string;
  line: number;
}

/** Root-Block einer video.txt ("video.cfg"/"config"). Fragmente ohne Kopf: oberste Ebene. */
export function videoRoot(doc: KvDocument): { nodes: KvNode[]; block: string[] } {
  const blk = doc.nodes.find((n) => n.children);
  if (blk) return { nodes: blk.children!, block: [blk.key] };
  return { nodes: doc.nodes, block: [] };
}

export function readValues(kind: ConfigFileKind, text: string): Map<string, ValueEntry> {
  if (kind === 'video.txt') {
    const doc = parseKv(text);
    return leafMap(videoRoot(doc).nodes);
  }
  if (kind === 'gameinfo.gi') {
    const doc = parseKv(text);
    return leafMap(findBlock(doc.nodes, ['GameInfo', 'ConVars'])?.children);
  }
  const doc = parseCfg(text);
  const m = new Map<string, ValueEntry>();
  for (const [k, c] of effectiveConvars(doc)) m.set(k, { key: c.name, value: c.args.join(' '), line: c.line });
  return m;
}

export function currentValue(kind: ConfigFileKind, text: string, key: string): string | undefined {
  return readValues(kind, text).get(key.toLowerCase())?.value;
}

// ---------------------------------------------------------------- Werte schreiben

export interface SetRequest {
  settingId: string;
  value: string | null;
}

export class EditRejected extends Error {}

/** Schreibt Formularwerte in den Entwurfstext einer Datei. */
export function applyToText(kind: ConfigFileKind, text: string, reqs: SetRequest[]): string {
  const defs = reqs.map((r) => {
    const def = SETTINGS_BY_ID.get(r.settingId);
    if (!def) throw new EditRejected(`Unbekannte Einstellung ${r.settingId}`);
    if (def.file !== kind) throw new EditRejected(`${def.label} gehört zu ${def.file}`);
    if (r.value !== null) {
      const v = validateValue(def, r.value);
      if (!v.ok) throw new EditRejected(`${def.label}: ${v.message}`);
    }
    return { def, value: r.value === null ? null : validateValue(def, r.value).normalized! };
  });
  if (kind === 'video.txt') {
    const doc = parseKv(text);
    const { block, nodes } = videoRoot(doc);
    const cur = leafMap(nodes);
    return setValues(
      doc,
      defs.map(({ def, value }) => ({ block, key: def.key, value: value === null ? null : formatLike(cur.get(def.key.toLowerCase())?.value, value, def.type) })),
    );
  }
  if (kind === 'gameinfo.gi') {
    const doc = parseKv(text);
    const cur = leafMap(findBlock(doc.nodes, ['GameInfo', 'ConVars'])?.children);
    return setValues(
      doc,
      defs.map(({ def, value }) => ({ block: ['GameInfo', 'ConVars'], key: def.key, value: value === null ? null : formatLike(cur.get(def.key.toLowerCase())?.value, value, def.type) })),
    );
  }
  const doc = parseCfg(text);
  const cur = effectiveConvars(doc);
  const section = defs.every((d) => d.def.group === 'crosshair') ? 'Crosshair' : 'Einstellungen';
  return setConvars(
    doc,
    defs.map(({ def, value }) => ({ name: def.key, value: value === null ? null : formatLike(cur.get(def.key.toLowerCase())?.args.join(' '), value, def.type) })),
    section,
  );
}

// ---------------------------------------------------------------- semantischer Diff & ChangeSet

export interface SemanticChange {
  file: ConfigFileKind;
  key: string;
  before: string | undefined;
  after: string | undefined;
  def?: SettingDefinition;
  line?: number;
}

export function semanticDiff(kind: ConfigFileKind, before: string, after: string): SemanticChange[] {
  const a = readValues(kind, before);
  const b = readValues(kind, after);
  const keys = new Set([...a.keys(), ...b.keys()]);
  const out: SemanticChange[] = [];
  for (const k of keys) {
    const va = a.get(k)?.value;
    const vb = b.get(k)?.value;
    if (va !== vb) out.push({ file: kind, key: b.get(k)?.key || a.get(k)!.key, before: va, after: vb, def: findSetting(kind, k), line: b.get(k)?.line ?? a.get(k)?.line });
  }
  if (kind === 'autoexec.cfg') {
    const ba = bindings(parseCfg(before));
    const bb = bindings(parseCfg(after));
    for (const k of new Set([...ba.keys(), ...bb.keys()])) {
      if (ba.get(k)?.command !== bb.get(k)?.command) out.push({ file: kind, key: `bind ${bb.get(k)?.key || ba.get(k)!.key}`, before: ba.get(k)?.command, after: bb.get(k)?.command, line: bb.get(k)?.line });
    }
  }
  return out.sort((x, y) => (x.line ?? 0) - (y.line ?? 0));
}

export type BlockReason =
  | 'device-specific'
  | 'draft-only'
  | 'not-in-local-build'
  | 'invalid'
  | 'parse-error'
  | 'structure-outside-convars'
  | 'unknown-key';

export interface ChangeItem extends SemanticChange {
  reason?: string;
  restartRequired: boolean;
  blocked?: { reason: BlockReason; message: string };
}

export interface FileChange {
  kind: ConfigFileKind;
  path: string;
  existed: boolean;
  beforeSha256: string;
  beforeText: string;
  afterText: string;
  bom: boolean;
  items: ChangeItem[];
  /** Zeilen geändert, die keinem bekannten Schlüssel zuzuordnen sind (z. B. Kommentare im Expertenmodus). */
  otherLineChanges: number;
  applicable: boolean;
}

export interface ChangeSet {
  id: string;
  createdAt: string;
  files: FileChange[];
  warnings: string[];
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Baut aus Original und Entwurf ein prüfbares ChangeSet.
 * Blockiert (nicht anwendbar) sind: gerätespezifische Werte, Entwurf-Only-Einstellungen,
 * Schlüssel, die der lokale Build nicht angelegt hat, ungültige Werte, Parserfehler.
 */
export function buildChangeSet(files: LoadedFile[], draft: Draft, reasons: Record<string, string> = {}): ChangeSet {
  const out: FileChange[] = [];
  const warnings: string[] = [];
  for (const f of files) {
    const after = draft[f.kind];
    if (after === undefined || after === f.text) continue;
    const items: ChangeItem[] = semanticDiff(f.kind, f.text, after).map((c) => ({
      ...c,
      restartRequired: c.def?.restartRequired ?? f.kind !== 'autoexec.cfg',
      reason: c.def ? reasons[c.def.id] : undefined,
    }));
    const beforeVals = readValues(f.kind, f.text);
    for (const it of items) {
      if (f.kind === 'video.txt' && VIDEO_DEVICE_KEYS.some((k) => k.toLowerCase() === it.key.toLowerCase())) {
        it.blocked = { reason: 'device-specific', message: 'Gerätekennung – wird nie verändert.' };
        continue;
      }
      if (!it.def) {
        if (f.kind === 'autoexec.cfg' && it.key.startsWith('bind ')) continue; // Tastenbelegung: erlaubt
        if (f.kind === 'autoexec.cfg') continue; // eigene Konsolenbefehle des Nutzers im Expertenmodus
        it.blocked = { reason: 'unknown-key', message: 'Unbekannter Schlüssel – nicht im geprüften Katalog.' };
        continue;
      }
      if (it.def.applyPolicy === 'draft-only') {
        it.blocked = { reason: 'draft-only', message: 'Nur Entwurf: Anwendungsweg nicht geprüft.' };
        continue;
      }
      if (it.def.applyPolicy === 'if-present' && !beforeVals.has(it.def.key.toLowerCase())) {
        it.blocked = { reason: 'not-in-local-build', message: 'Die lokale Datei enthält diesen Schlüssel nicht – der installierte Build kennt ihn möglicherweise nicht.' };
        continue;
      }
      if (it.after !== undefined) {
        const v = validateValue(it.def, it.after);
        if (!v.ok) it.blocked = { reason: 'invalid', message: v.message! };
      }
    }
    if (f.kind !== 'autoexec.cfg') {
      const issues = parseKv(after).issues;
      if (issues.length && !parseKv(f.text).issues.length) {
        warnings.push(`${f.kind}: Der Entwurf enthält Syntaxfehler (Zeile ${issues[0].line}: ${issues[0].message}).`);
        items.push({ file: f.kind, key: '(Syntax)', before: undefined, after: undefined, restartRequired: false, blocked: { reason: 'parse-error', message: issues[0].message } });
      }
    }
    if (f.kind === 'gameinfo.gi' && stripConvars(f.text) !== stripConvars(after)) {
      items.push({
        file: f.kind,
        key: '(Struktur)',
        before: undefined,
        after: undefined,
        restartRequired: true,
        blocked: { reason: 'structure-outside-convars', message: 'Änderungen außerhalb des ConVars-Blocks werden nicht angewendet.' },
      });
    }
    // Geänderte Zeilen, die keinem erkannten Eintrag zuzuordnen sind (z. B. Kommentare im Expertenmodus)
    const keys = items.map((i) => i.key.replace(/^bind /, '').toLowerCase()).filter((k) => !k.startsWith('('));
    const otherLineChanges = lineDiff(f.text, after).filter((l) => l.kind !== 'same' && !keys.some((k) => l.text.toLowerCase().includes(k))).length;
    out.push({
      kind: f.kind,
      path: f.path,
      existed: f.exists,
      beforeSha256: f.sha256,
      beforeText: f.text,
      afterText: after,
      bom: f.bom,
      items,
      otherLineChanges,
      applicable: items.every((i) => !i.blocked),
    });
  }
  return { id: uid(), createdAt: new Date().toISOString(), files: out, warnings };
}

function stripConvars(text: string): string {
  const doc = parseKv(text);
  const blk = findBlock(doc.nodes, ['GameInfo', 'ConVars']);
  if (!blk?.openTok || !blk.closeTok) return text;
  return text.slice(0, blk.openTok.end) + text.slice(blk.closeTok.start);
}

/**
 * Entfernt blockierte Änderungen aus dem Entwurf, damit nur geprüfte Werte geschrieben werden.
 * Ergebnis: pro Datei der Text, der tatsächlich geschrieben werden darf.
 */
export function applicableText(fc: FileChange): string | null {
  const ok = fc.items.filter((i) => !i.blocked && i.def);
  const otherOk = fc.kind === 'autoexec.cfg';
  if (fc.items.every((i) => !i.blocked)) return fc.afterText;
  if (fc.items.some((i) => i.blocked?.reason === 'parse-error')) return null;
  // Teilweise anwendbar: nur die zulässigen Katalogwerte auf den Originaltext anwenden.
  if (!ok.length && !otherOk) return null;
  const reqs = ok.map((i) => ({ settingId: i.def!.id, value: i.after ?? null }));
  return reqs.length ? applyToText(fc.kind, fc.beforeText, reqs) : null;
}

// ---------------------------------------------------------------- Import & Erklärung

export interface ImportOptions {
  groups: SettingGroup[];
}

export interface ImportReport {
  kind: ConfigFileKind;
  adopted: { key: string; value: string; label: string }[];
  skippedDevice: string[];
  skippedNotInLocal: string[];
  skippedDraftOnly: string[];
  skippedGroup: string[];
  notAdopted: { key: string; value: string; why: string }[];
  duplicates: { key: string; lines: number[]; values: string[] }[];
  modHints: string[];
  parseIssues: string[];
  draftText: string;
}

const RISKY_PREFIXES = ['sv_', 'host_', 'rcon', 'net_fake', 'developer', 'mp_'];

/** Übernimmt Werte aus einer fremden Datei in den lokalen Entwurf – nie die ganze Datei. */
export function importInto(kind: ConfigFileKind, localText: string, foreignText: string, opts: ImportOptions): ImportReport {
  const report: ImportReport = {
    kind,
    adopted: [],
    skippedDevice: [],
    skippedNotInLocal: [],
    skippedDraftOnly: [],
    skippedGroup: [],
    notAdopted: [],
    duplicates: [],
    modHints: [],
    parseIssues: [],
    draftText: localText,
  };
  const foreign = readValues(kind, foreignText);
  const local = readValues(kind, localText);
  const reqs: SetRequest[] = [];

  if (kind !== 'autoexec.cfg') {
    const doc = parseKv(foreignText);
    report.parseIssues = doc.issues.map((i) => `Zeile ${i.line}: ${i.message}`);
    report.duplicates = duplicates(kind === 'video.txt' ? videoRoot(doc).nodes : findBlock(doc.nodes, ['GameInfo', 'ConVars'])?.children || []);
    if (kind === 'gameinfo.gi') report.modHints = gameinfoModHints(foreignText);
  } else {
    const doc = parseCfg(foreignText);
    report.duplicates = cfgDuplicates(doc).map((d) => ({ key: d.name, lines: d.lines, values: d.values }));
    for (const c of doc.commands) {
      const nm = c.name.toLowerCase();
      if (NON_CONVAR_COMMANDS.has(nm) && nm !== 'echo') report.notAdopted.push({ key: c.name, value: c.args.join(' '), why: nm === 'bind' ? 'Tastenbelegung – nur über „Eingabe“ übernehmbar' : 'Befehl wird nie automatisch übernommen' });
    }
  }

  for (const [k, entry] of foreign) {
    if (kind === 'video.txt' && VIDEO_DEVICE_KEYS.some((d) => d.toLowerCase() === k)) {
      report.skippedDevice.push(entry.key);
      continue;
    }
    const def = findSetting(kind, k);
    if (!def) {
      const risky = RISKY_PREFIXES.some((p) => k.startsWith(p));
      report.notAdopted.push({ key: entry.key, value: entry.value, why: risky ? 'Server-/Cheat-/Entwicklerbefehl – wird nie übernommen' : 'Unbekannt – nicht im geprüften Katalog' });
      continue;
    }
    if (!def.portable) {
      report.skippedDevice.push(entry.key);
      continue;
    }
    if (!opts.groups.includes(def.group)) {
      report.skippedGroup.push(entry.key);
      continue;
    }
    if (def.applyPolicy === 'draft-only') {
      report.skippedDraftOnly.push(`${entry.key} = ${entry.value}`);
      continue;
    }
    if (def.applyPolicy === 'if-present' && !local.has(k)) {
      report.skippedNotInLocal.push(entry.key);
      continue;
    }
    const v = validateValue(def, entry.value);
    if (!v.ok) {
      report.notAdopted.push({ key: entry.key, value: entry.value, why: `Ungültig: ${v.message}` });
      continue;
    }
    if (local.get(k)?.value === entry.value) continue;
    reqs.push({ settingId: def.id, value: v.normalized! });
    report.adopted.push({ key: entry.key, value: v.normalized!, label: def.label });
  }
  if (reqs.length) report.draftText = applyToText(kind, localText, reqs);
  return report;
}

/** Erkennt in einer gameinfo.gi Hinweise auf Mod-Abhängigkeiten (zusätzliche Suchpfade). */
export function gameinfoModHints(text: string): string[] {
  const hints: string[] = [];
  const doc = parseKv(text);
  const sp = findBlock(doc.nodes, ['GameInfo', 'FileSystem', 'SearchPaths']);
  for (const n of sp?.children || []) {
    if (n.valueTok && /addons/i.test(n.valueTok.value)) hints.push(`Suchpfad „${n.key} ${n.valueTok.value}“ – lädt Mods aus einem addons-Ordner.`);
  }
  if (/\.vpk/i.test(text)) hints.push('Verweist auf .vpk-Dateien – mögliche Mod-Abhängigkeit.');
  return hints;
}

export interface ConfigExplanation {
  kind: ConfigFileKind;
  known: { key: string; value: string; label: string; status: string; group: SettingGroup }[];
  unknown: { key: string; value: string }[];
  device: string[];
  duplicates: { key: string; lines: number[]; values: string[] }[];
  differsFromLocal: { key: string; local: string | undefined; foreign: string }[];
  modHints: string[];
  parseIssues: string[];
  bindings: { key: string; command: string }[];
}

/** Regelbasierte Erklärung einer Config: was sie setzt, was unbekannt ist, wo Konflikte bestehen. */
export function explainConfig(kind: ConfigFileKind, text: string, localText?: string): ConfigExplanation {
  const vals = readValues(kind, text);
  const local = localText !== undefined ? readValues(kind, localText) : undefined;
  const ex: ConfigExplanation = { kind, known: [], unknown: [], device: [], duplicates: [], differsFromLocal: [], modHints: [], parseIssues: [], bindings: [] };
  for (const [k, e] of vals) {
    if (kind === 'video.txt' && VIDEO_DEVICE_KEYS.some((d) => d.toLowerCase() === k)) {
      ex.device.push(`${e.key} = ${e.value}`);
      continue;
    }
    const def = findSetting(kind, k);
    if (def) {
      if (!def.portable) ex.device.push(`${e.key} = ${e.value}`);
      else ex.known.push({ key: e.key, value: e.value, label: def.label, status: def.status, group: def.group });
    } else ex.unknown.push({ key: e.key, value: e.value });
    if (local && local.get(k)?.value !== e.value) ex.differsFromLocal.push({ key: e.key, local: local.get(k)?.value, foreign: e.value });
  }
  if (kind === 'autoexec.cfg') {
    const doc = parseCfg(text);
    ex.duplicates = cfgDuplicates(doc).map((d) => ({ key: d.name, lines: d.lines, values: d.values }));
    ex.bindings = [...bindings(doc).values()].map((b) => ({ key: b.key, command: b.command }));
  } else {
    const doc = parseKv(text);
    ex.parseIssues = doc.issues.map((i) => `Zeile ${i.line}: ${i.message}`);
    ex.duplicates = duplicates(kind === 'video.txt' ? videoRoot(doc).nodes : findBlock(doc.nodes, ['GameInfo', 'ConVars'])?.children || []);
    if (kind === 'gameinfo.gi') ex.modHints = gameinfoModHints(text);
  }
  return ex;
}

/** Erkennt den Dateityp anhand von Name und Inhalt. */
export function detectKind(name: string, text: string): ConfigFileKind | null {
  const n = name.toLowerCase();
  if (n.endsWith('gameinfo.gi')) return 'gameinfo.gi';
  if (n.endsWith('video.txt')) return 'video.txt';
  if (n.endsWith('.cfg')) return 'autoexec.cfg';
  if (/^\s*(\/\/.*\n\s*)*"?video\.cfg"?\s*\{/i.test(text) || /"setting\.[a-z_]+"/i.test(text)) return 'video.txt';
  if (/^\s*(\/\/.*\n\s*)*GameInfo\s*\{/m.test(text)) return 'gameinfo.gi';
  return null;
}

/** Werte eines Profils für Mixer/Vergleich: je Einstellung der Wert aus dem Text. */
export function profileValues(files: Draft): Map<string, string> {
  const out = new Map<string, string>();
  for (const def of SETTINGS) {
    const t = files[def.file];
    if (t === undefined) continue;
    const v = currentValue(def.file, t, def.key);
    if (v !== undefined) out.set(def.id, v);
  }
  return out;
}
