import { getStore, saveStore } from "./store";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Aktuelle Einstellungen (Standardwerte + gespeicherte Werte, validiert). */
export function getSettings(): AppSettings {
  const raw = getStore().settings ?? {};
  return sanitize({ ...DEFAULT_SETTINGS, ...raw });
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
  };
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const store = getStore();
  const next = sanitize({ ...getSettings(), ...patch });
  store.settings = next;
  saveStore();
  return next;
}
