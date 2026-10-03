import {
  AVATAR_COUNT,
  CATEGORIES,
  LIMITS,
  ROUND_OPTIONS,
  TURN_SECONDS_OPTIONS,
  type LobbySettings,
  type Profile,
} from '../../../shared/protocol.ts';
import { parseServerAddress } from '../../../shared/server.ts';

/**
 * Reine Funktionen zum Laden gespeicherter Werte. Sie tolerieren fehlende,
 * leere, veraltete oder beschädigte Einträge und fallen dann auf Standards zurück.
 */

export const SETTINGS_VERSION = 2;

export interface LocalSettings {
  version: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
  /** 'system' folgt der Betriebssystem-Einstellung */
  reducedMotion: 'system' | 'on' | 'off';
  privacyMode: boolean;
  onboardingDone: boolean;
  /**
   * Bewusst gesetzter Entwickler-Override (Einstellungen → Erweitert).
   * Leer = Standardserver. Der frühere Schlüssel `serverUrl` (Version 1) wird bei
   * der Migration verworfen, weil er alte lokale Testadressen enthalten kann.
   */
  serverOverride: string;
  historyView: 'rounds' | 'players';
}

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  version: SETTINGS_VERSION,
  sfxVolume: 0.7,
  musicVolume: 0.25,
  muted: false,
  reducedMotion: 'system',
  privacyMode: false,
  onboardingDone: false,
  serverOverride: '',
  historyView: 'rounds',
};

const num01 = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

export function sanitizeSettings(raw: unknown): LocalSettings {
  const d = DEFAULT_LOCAL_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d };
  const r = raw as Record<string, unknown>;
  const override = typeof r.serverOverride === 'string' && parseServerAddress(r.serverOverride) ? r.serverOverride.trim() : '';
  return {
    version: SETTINGS_VERSION,
    sfxVolume: num01(r.sfxVolume, d.sfxVolume),
    musicVolume: num01(r.musicVolume, d.musicVolume),
    muted: bool(r.muted, d.muted),
    reducedMotion: r.reducedMotion === 'on' || r.reducedMotion === 'off' ? r.reducedMotion : 'system',
    privacyMode: bool(r.privacyMode, d.privacyMode),
    onboardingDone: bool(r.onboardingDone, d.onboardingDone),
    // Version 1 kannte nur `serverUrl` – bewusst NICHT übernommen.
    serverOverride: (r.version ?? 1) === SETTINGS_VERSION ? override : '',
    historyView: r.historyView === 'players' ? 'players' : 'rounds',
  };
}

export function cleanName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, LIMITS.nameMax);
}

/** Prüft einen Anzeigenamen und liefert eine verständliche Meldung oder null. */
export function nameProblem(raw: string): string | null {
  const cleaned = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Bitte gib einen Namen ein.';
  if ([...cleaned].length > LIMITS.nameMax) return `Höchstens ${LIMITS.nameMax} Zeichen.`;
  if (/[\u0000-\u001f\u007f]/.test(cleaned)) return 'Der Name enthält unzulässige Zeichen.';
  return null;
}

export interface StoredProfile extends Profile {
  set: boolean;
}

export function sanitizeProfile(raw: unknown, randomAvatar: number): StoredProfile {
  if (!raw || typeof raw !== 'object') return { name: '', avatar: randomAvatar, set: false };
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? cleanName(r.name) : '';
  const avatar = typeof r.avatar === 'number' && Number.isInteger(r.avatar) && r.avatar >= 0 && r.avatar < AVATAR_COUNT ? r.avatar : randomAvatar;
  return { name, avatar, set: r.set === true && name.length > 0 };
}

/** Zuletzt als Host verwendete Lobby-Einstellungen (bewusste Nutzerpräferenz). */
export function sanitizeHostPrefs(raw: unknown): Partial<LobbySettings> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: Partial<LobbySettings> = {};
  if ((ROUND_OPTIONS as readonly unknown[]).includes(r.maxRounds)) out.maxRounds = r.maxRounds as LobbySettings['maxRounds'];
  if ((TURN_SECONDS_OPTIONS as readonly unknown[]).includes(r.turnSeconds)) out.turnSeconds = r.turnSeconds as LobbySettings['turnSeconds'];
  if (Array.isArray(r.categories)) {
    const cats = CATEGORIES.map((c) => c.id).filter((id) => (r.categories as unknown[]).includes(id));
    if (cats.length) out.categories = cats;
  }
  if (typeof r.categoryHint === 'boolean') out.categoryHint = r.categoryHint;
  if (typeof r.scoreboard === 'boolean') out.scoreboard = r.scoreboard;
  return Object.keys(out).length ? out : null;
}
