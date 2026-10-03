// Plattform-Abstraktion: Desktop (Tauri, native Funktionen) vs. Browser (Import/Export, keine direkten Schreibzugriffe).

import type { HardwareSnapshot } from '../core/models.ts';

export interface InstallFileInfo {
  kind: 'video.txt' | 'gameinfo.gi' | 'autoexec.cfg';
  relPath: string;
  exists: boolean;
}

export interface InstallationInfo {
  id: string;
  root: string;
  libraryPath: string | null;
  appId: number;
  buildId: string | null;
  patchVersion: string | null;
  lastUpdated: string | null;
  detectedVia: string;
  files: InstallFileInfo[];
  otherCfgs: string[];
}

export interface NativeRead {
  relPath: string;
  kind: string | null;
  exists: boolean;
  text: string;
  bom: boolean;
  encodingOk: boolean;
  sha256: string | null;
  size: number;
  modified: string | null;
}

export interface FileWrite {
  relPath: string;
  text: string | null;
  bom: boolean;
  expectedSha256: string | null;
}

export interface ApplyRequest {
  installRoot: string;
  installationId: string;
  buildId: string | null;
  changeSetId: string;
  reason: string;
  changeSummary: string[];
  files: FileWrite[];
}

export interface ApplyOutcome {
  changeSetId: string;
  backupId: string;
  files: { kind: string; relPath: string; newSha256: string | null; readbackOk: boolean }[];
}

export interface BackupManifest {
  id: string;
  createdAt: string;
  installationId: string;
  installRoot: string;
  buildId: string | null;
  reason: string;
  files: { kind: string; relPath: string; sha256: string | null; existed: boolean; size: number }[];
  changeSummary: string[];
  working?: { at: string; how: string };
  applied: { kind: string; relPath: string; sha256: string | null; existed: boolean }[];
}

export interface RestoreOutcome {
  preRestoreBackupId: string;
  restored: string[];
  skipped: [string, string][];
}

export interface PlatformError {
  code: 'conflict' | 'game-running' | 'io' | 'path' | 'rolled-back' | 'invalid' | 'unsupported';
  message: string;
}

export type Collection = 'profiles' | 'benchmarks' | 'settings' | 'install-state' | 'crosshairs' | 'players-cache' | 'screenshots-meta';

export interface Platform {
  kind: 'desktop' | 'browser';
  detectInstallations(): Promise<InstallationInfo[]>;
  registerInstallation(path: string): Promise<InstallationInfo>;
  pickFolder(): Promise<string | null>;
  pickExe(): Promise<string | null>;
  readConfig(root: string, relPath: string): Promise<NativeRead>;
  gameRunning(): Promise<boolean | null>;
  apply(req: ApplyRequest): Promise<ApplyOutcome>;
  snapshot(req: { installRoot: string; installationId: string; buildId: string | null; reason: string; relPaths: string[]; working: string | null }): Promise<BackupManifest>;
  listBackups(): Promise<BackupManifest[]>;
  backupText(id: string, kind: string): Promise<string | null>;
  restoreBackup(id: string, currentBuild: string | null, kinds?: string[]): Promise<RestoreOutcome>;
  markBackupWorking(id: string, how: 'user' | 'game-kept-values'): Promise<void>;
  hardware(): Promise<HardwareSnapshot | null>;
  store: {
    put(coll: Collection, id: string, value: unknown): Promise<void>;
    get<T>(coll: Collection, id: string): Promise<T | null>;
    list<T>(coll: Collection): Promise<T[]>;
    delete(coll: Collection, id: string): Promise<void>;
  };
  startupNotes(): Promise<string[]>;
  openUrl(url: string): Promise<void>;
  openWindowsSettings(uri: string): Promise<void>;
  runPresentMon(exe: string, seconds: number): Promise<string>;
}

export function isPlatformError(e: unknown): e is PlatformError {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e;
}

export function errorMessage(e: unknown): string {
  if (isPlatformError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Datei im Browser/WebView als Download speichern (bewusster Export durch den Nutzer). */
export function downloadText(name: string, text: string, type = 'text/plain') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
