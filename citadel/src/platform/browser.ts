// Browser-Version: keine Installationserkennung, kein direktes Schreiben in Spielordner.
// Profile/Messungen liegen nur in diesem Browser (localStorage). Configs werden importiert und exportiert.

import type { Platform, PlatformError } from './types.ts';

const unsupported = (what: string): PlatformError => ({ code: 'unsupported', message: `${what} ist nur in der Desktop-App verfügbar.` });

function key(coll: string, id: string) {
  return `citadel:${coll}:${id}`;
}

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export const browserPlatform: Platform = {
  kind: 'browser',
  detectInstallations: async () => [],
  registerInstallation: async () => {
    throw unsupported('Die Ordnerauswahl einer Installation');
  },
  pickFolder: async () => null,
  pickExe: async () => null,
  readConfig: async () => {
    throw unsupported('Direktes Lesen aus dem Spielordner');
  },
  gameRunning: async () => null,
  apply: async () => {
    throw unsupported('Direktes Anwenden');
  },
  snapshot: async () => {
    throw unsupported('Backups');
  },
  listBackups: async () => [],
  backupText: async () => null,
  restoreBackup: async () => {
    throw unsupported('Wiederherstellen');
  },
  markBackupWorking: async () => {
    throw unsupported('Backups');
  },
  hardware: async () => null,
  store: {
    async put(coll, id, value) {
      try {
        localStorage.setItem(key(coll, id), JSON.stringify(value));
      } catch {
        /* Speicher nicht verfügbar – Sitzung bleibt funktionsfähig */
      }
    },
    async get<T>(coll: string, id: string) {
      const s = safeGet(key(coll, id));
      return s ? (JSON.parse(s) as T) : null;
    },
    async list<T>(coll: string) {
      const out: T[] = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!;
          if (k.startsWith(`citadel:${coll}:`)) out.push(JSON.parse(localStorage.getItem(k)!) as T);
        }
      } catch {
        /* ignorieren */
      }
      return out;
    },
    async delete(coll, id) {
      try {
        localStorage.removeItem(key(coll, id));
      } catch {
        /* ignorieren */
      }
    },
  },
  startupNotes: async () => [],
  openUrl: async (url) => {
    if (/^https:\/\//.test(url)) window.open(url, '_blank', 'noopener');
  },
  openWindowsSettings: async () => {
    throw unsupported('Das Öffnen von Windows-Einstellungen');
  },
  runPresentMon: async () => {
    throw unsupported('Die PresentMon-Aufnahme');
  },
};
