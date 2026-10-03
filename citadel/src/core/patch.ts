// Patch-Check: erkennt Build- und Dateiänderungen und markiert betroffene Einstellungen.

import { SETTINGS } from './catalog.ts';
import { readValues } from './config.ts';

export interface InstallState {
  buildId: string | null;
  checkedAt: string;
  files: { kind: 'video.txt' | 'gameinfo.gi' | 'autoexec.cfg'; sha256: string | null; keys: string[] }[];
}

export interface PatchReport {
  buildChanged: boolean;
  oldBuild: string | null;
  newBuild: string | null;
  changedFiles: string[];
  /** Schlüssel, die der neue Build nicht mehr schreibt. */
  removedKeys: string[];
  /** Neue Schlüssel, die der Katalog nicht kennt. */
  newUnknownKeys: string[];
  /** Einstellungen, deren Kompatibilität erneut geprüft werden muss. */
  recheck: string[];
  gameinfoReplaced: boolean;
}

export function snapshotState(buildId: string | null, files: { kind: InstallState['files'][number]['kind']; sha256: string | null; text: string | null }[]): InstallState {
  return {
    buildId,
    checkedAt: new Date().toISOString(),
    files: files.map((f) => ({ kind: f.kind, sha256: f.sha256, keys: f.text ? [...readValues(f.kind, f.text).keys()] : [] })),
  };
}

export function comparePatch(prev: InstallState, next: InstallState): PatchReport {
  const changedFiles: string[] = [];
  const removedKeys: string[] = [];
  const newUnknownKeys: string[] = [];
  for (const nf of next.files) {
    const pf = prev.files.find((f) => f.kind === nf.kind);
    if (!pf) continue;
    if (pf.sha256 !== nf.sha256) changedFiles.push(nf.kind);
    const before = new Set(pf.keys);
    const after = new Set(nf.keys);
    for (const k of before) if (!after.has(k)) removedKeys.push(`${nf.kind}: ${k}`);
    for (const k of after) if (!before.has(k) && !SETTINGS.some((s) => s.file === nf.kind && s.key.toLowerCase() === k)) newUnknownKeys.push(`${nf.kind}: ${k}`);
  }
  const buildChanged = prev.buildId !== next.buildId && next.buildId !== null;
  const recheck = buildChanged ? SETTINGS.filter((s) => s.file !== 'autoexec.cfg').map((s) => s.id) : [];
  return {
    buildChanged,
    oldBuild: prev.buildId,
    newBuild: next.buildId,
    changedFiles,
    removedKeys,
    newUnknownKeys,
    recheck,
    gameinfoReplaced: changedFiles.includes('gameinfo.gi') && buildChanged,
  };
}

/** Eine vollständige gameinfo.gi aus einem älteren Build darf nie zurückkopiert werden. */
export function canRestoreWholeFile(kind: string, backupBuild: string | null, currentBuild: string | null): { ok: boolean; reason?: string } {
  if (kind !== 'gameinfo.gi') return { ok: true };
  if (backupBuild && currentBuild && backupBuild === currentBuild) return { ok: true };
  return {
    ok: false,
    reason: `Backup stammt aus Build ${backupBuild ?? 'unbekannt'}, installiert ist ${currentBuild ?? 'unbekannt'}. Eine alte gameinfo.gi wird nicht über eine neue kopiert – nur kompatible Einzelwerte können wiederhergestellt werden.`,
  };
}
