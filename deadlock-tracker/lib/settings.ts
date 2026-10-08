import { getStore, saveStore } from "./store";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, type AppSettings, type ProfileSettings } from "./types";
import { BADGE_KEYS, MAX_BADGES, MAX_STATS, MAX_TITLE, STAT_KEYS, isHex } from "./profile-customize";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Aktuelle Einstellungen (Standardwerte + gespeicherte Werte, validiert). */
export function getSettings(): AppSettings {
  const raw = getStore().settings ?? {};
  return sanitize({ ...DEFAULT_SETTINGS, ...raw });
}

const uniqueIn = (v: unknown, allowed: string[], max: number, fallback: string[]) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && allowed.includes(x)))].slice(0, max) : fallback;

export function sanitizeProfile(p: unknown): ProfileSettings {
  const d = DEFAULT_PROFILE;
  const o = (p && typeof p === "object" ? p : {}) as Partial<Record<keyof ProfileSettings, unknown>>;
  const hero = Number(o.mainHero);
  return {
    title: typeof o.title === "string" ? [...o.title.replace(/[\u0000-\u001f\u007f<>]/g, "").trim()].slice(0, MAX_TITLE).join("").trim() : d.title,
    mainHero: Number.isInteger(hero) && hero > 0 && hero < 1e6 ? hero : null,
    stats: uniqueIn(o.stats, STAT_KEYS, MAX_STATS, d.stats),
    badges: uniqueIn(o.badges, BADGE_KEYS, MAX_BADGES, d.badges),
    accent: o.accent === "rank" || o.accent === "hero" ? o.accent : isHex(o.accent) ? o.accent.toLowerCase() : "auto",
  };
}

export function sanitize(s: Partial<AppSettings>): AppSettings {
  const d = DEFAULT_SETTINGS;
  return {
    pollIntervalS: clamp(Math.round(Number(s.pollIntervalS) || d.pollIntervalS), 10, 300),
    backfill: s.backfill === undefined ? d.backfill : !!s.backfill,
    notifyNewMatch: s.notifyNewMatch === undefined ? d.notifyNewMatch : !!s.notifyNewMatch,
    showLive: s.showLive === undefined ? d.showLive : !!s.showLive,
    effects: s.effects === "reduced" || s.effects === "off" ? s.effects : "full",
    density: s.density === "compact" ? "compact" : "comfortable",
    profile: sanitizeProfile(s.profile),
  };
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const store = getStore();
  const next = sanitize({ ...getSettings(), ...patch });
  store.settings = next;
  saveStore();
  return next;
}
