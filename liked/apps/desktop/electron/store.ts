import { app, safeStorage } from 'electron';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AVATARS } from '@liked/protocol';
import type { LikeIndex } from '@liked/tiktok-connectors';
import type { AppSettings } from '../src/shared/ipc-types.js';

/**
 * Lokale Datenhaltung im Benutzerprofil (%APPDATA%/LIKED). Updates lassen diese
 * Dateien unberührt. Enthält nur, was das Spiel braucht.
 */
const dir = () => {
  const d = app.getPath('userData');
  mkdirSync(d, { recursive: true });
  return d;
};
const file = (name: string) => join(dir(), name);

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file(name), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(name: string, value: unknown): void {
  const tmp = file(`${name}.tmp`);
  writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  renameSync(tmp, file(name));
}

function remove(name: string): void {
  if (existsSync(file(name))) rmSync(file(name));
}

export function defaultSettings(): AppSettings {
  return {
    profile: {
      name: '',
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)]!,
      deviceId: randomBytes(18).toString('base64url')
    },
    serverUrl: DEFAULT_SERVER_URL,
    serverUrlCustom: false,
    audio: { music: 0.5, sfx: 0.7, musicMuted: false, sfxMuted: false, videoStartMuted: false },
    display: { fullscreen: false, reducedMotion: 'system', effects: 'high' },
    introSeen: false,
    experimentalWebAdapter: false
  };
}

declare const __DEFAULT_SERVER_URL__: string;

/** Im Build festgelegter zentraler Server – Spieler müssen nichts eintragen. */
export const DEFAULT_SERVER_URL: string = process.env.LIKED_SERVER_URL || __DEFAULT_SERVER_URL__;

export function loadSettings(): AppSettings {
  const d = defaultSettings();
  const s = readJson<Partial<AppSettings>>('settings.json', {});
  const merged: AppSettings = {
    ...d,
    ...s,
    profile: { ...d.profile, ...s.profile },
    audio: { ...d.audio, ...s.audio },
    display: { ...d.display, ...s.display }
  };
  // Ohne eigene Eingabe immer den Standard-Server des aktuellen Builds verwenden
  // (auch wenn eine ältere Version eine andere Standardadresse gespeichert hat).
  if (!merged.serverUrlCustom) merged.serverUrl = DEFAULT_SERVER_URL;
  if (!s.profile?.deviceId) writeJson('settings.json', merged);
  return merged;
}

export function saveSettings(s: AppSettings): void {
  writeJson('settings.json', s);
}

export const likeIndexStore = {
  load: (): LikeIndex | null => readJson<LikeIndex | null>('likes-index.json', null),
  save: (i: LikeIndex) => writeJson('likes-index.json', i),
  clear: () => remove('likes-index.json')
};

export const listStore = {
  recent: () => readJson<string[]>('recent-played.json', []),
  saveRecent: (ids: string[]) => writeJson('recent-played.json', ids),
  excluded: () => readJson<string[]>('excluded-clips.json', []),
  saveExcluded: (ids: string[]) => writeJson('excluded-clips.json', ids)
};

/**
 * Gerätegeheimnis für den offiziellen Adapter – mit Windows DPAPI (safeStorage)
 * verschlüsselt. Es identifiziert das Gerät gegenüber dem Auth-Dienst, nicht im Spiel.
 */
export const secretStore = {
  get(): string | null {
    try {
      const buf = readFileSync(file('tiktok-device.bin'));
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : null;
    } catch {
      return null;
    }
  },
  create(): string {
    const s = randomBytes(32).toString('base64url');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Sichere Speicherung ist auf diesem System nicht verfügbar');
    writeFileSync(file('tiktok-device.bin'), safeStorage.encryptString(s), { mode: 0o600 });
    return s;
  },
  clear: () => remove('tiktok-device.bin')
};

/** „Lokale Spieldaten löschen“: alles außer den Einstellungen. */
export function wipeLocalGameData(): void {
  for (const n of ['likes-index.json', 'recent-played.json', 'excluded-clips.json', 'tiktok-device.bin', 'last-room.json']) remove(n);
}

export const lastRoomStore = {
  get: () => readJson<{ serverUrl: string; code: string; token: string; at: number } | null>('last-room.json', null),
  set: (v: { serverUrl: string; code: string; token: string; at: number } | null) =>
    v ? writeJson('last-room.json', v) : remove('last-room.json')
};
