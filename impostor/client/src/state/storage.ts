import { useSyncExternalStore } from 'react';
import { AVATAR_COUNT, type LobbySettings } from '../../../shared/protocol.ts';
import {
  sanitizeHostPrefs,
  sanitizeProfile,
  sanitizeSettings,
  type LocalSettings,
  type StoredProfile,
} from './sanitize.ts';

export { cleanName, nameProblem, type LocalSettings, type StoredProfile } from './sanitize.ts';

/** Liest JSON aus localStorage; robust gegen gesperrten Speicher und kaputte Einträge. */
function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfügbar – Einstellungen gelten nur für diese Sitzung */
  }
}

function createStore<T extends object>(key: string, load: (raw: unknown) => T) {
  let value = load(readJson(key));
  // Bereinigte/migrierte Werte sofort zurückschreiben (z. B. alte Serveradressen entfernen).
  write(key, value);
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(patch: Partial<T>) {
      value = load({ ...value, ...patch });
      write(key, value);
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

/**
 * Für lokale Tests mehrerer Spieler in einem Browser: `?slot=2` usw. trennt Token
 * und Profil je Tab (sonst übernimmt ein zweiter Tab dieselbe Sitzung).
 */
function slotSuffix(): string {
  try {
    const slot = new URLSearchParams(location.search).get('slot');
    return slot && /^[a-z0-9]{1,8}$/i.test(slot) ? `.${slot}` : '';
  } catch {
    return '';
  }
}
const SLOT = slotSuffix();

export const settingsStore = createStore<LocalSettings>('impostor.settings', sanitizeSettings);

export function useSettings(): LocalSettings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get);
}

const randomAvatar = Math.floor(Math.random() * AVATAR_COUNT);
export const profileStore = createStore<StoredProfile>(`impostor.profile${SLOT}`, (raw) => sanitizeProfile(raw, randomAvatar));

export function useProfile(): StoredProfile {
  return useSyncExternalStore(profileStore.subscribe, profileStore.get);
}

/** Zuletzt als Host verwendete Lobby-Regeln – werden beim Erstellen einer Lobby übernommen. */
export const hostPrefs = {
  get(): Partial<LobbySettings> | null {
    return sanitizeHostPrefs(readJson('impostor.hostPrefs'));
  },
  set(settings: LobbySettings) {
    write('impostor.hostPrefs', {
      maxRounds: settings.maxRounds,
      turnSeconds: settings.turnSeconds,
      categories: settings.categories,
      categoryHint: settings.categoryHint,
      scoreboard: settings.scoreboard,
    });
  },
};

/** Sitzungstoken des Gastzugangs (kein Konto). */
export const tokenStorage = {
  get(): string | null {
    try {
      const t = localStorage.getItem(`impostor.token${SLOT}`);
      return t && t.length <= 64 ? t : null;
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(`impostor.token${SLOT}`, token);
    } catch {
      /* ignorieren */
    }
  },
};
