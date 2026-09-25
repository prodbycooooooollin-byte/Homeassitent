import { useSyncExternalStore } from 'react';
import { AVATAR_COUNT, LIMITS, type Profile } from '../../../shared/protocol.ts';

/** Kleiner, lokal gespeicherter Store (localStorage), robust gegen gesperrten Speicher. */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfügbar – Einstellungen gelten nur für diese Sitzung */
  }
}

function createStore<T extends object>(key: string, fallback: T) {
  let value = read(key, fallback);
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(patch: Partial<T>) {
      value = { ...value, ...patch };
      write(key, value);
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export interface LocalSettings {
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
  /** 'system' folgt der Betriebssystem-Einstellung */
  reducedMotion: 'system' | 'on' | 'off';
  privacyMode: boolean;
  onboardingDone: boolean;
  serverUrl: string;
  historyView: 'rounds' | 'players';
}

export const settingsStore = createStore<LocalSettings>('impostor.settings', {
  sfxVolume: 0.7,
  musicVolume: 0.25,
  muted: false,
  reducedMotion: 'system',
  privacyMode: false,
  onboardingDone: false,
  serverUrl: '',
  historyView: 'rounds',
});

export function useSettings(): LocalSettings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get);
}

export interface StoredProfile extends Profile {
  set: boolean;
}

export const profileStore = createStore<StoredProfile>('impostor.profile', {
  name: '',
  avatar: Math.floor(Math.random() * AVATAR_COUNT),
  set: false,
});

export function useProfile(): StoredProfile {
  return useSyncExternalStore(profileStore.subscribe, profileStore.get);
}

export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, LIMITS.nameMax);
}

/** Sitzungstoken des Gastzugangs (kein Konto). */
export const tokenStorage = {
  get(): string | null {
    try {
      return localStorage.getItem('impostor.token');
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem('impostor.token', token);
    } catch {
      /* ignorieren */
    }
  },
};
