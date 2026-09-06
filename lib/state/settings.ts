import type { AppSettings } from "../types";

export const DEFAULT_SETTINGS: AppSettings = {
  houseName: "Zuhause",
  pricePerKwh: 0.32,
  currency: "EUR",
  haUrl: "",
  haTokenConfigured: false,
  demoMode: true,
  solarEnabled: true,
  batteryEnabled: true,
  quickActionIds: ["waterheater", "heating", "lights", "outlets", "away", "night", "all-off"],
  theme: "dark",
  language: "de",
  notificationsEnabled: true,
};

const STORAGE_KEY = "smart-home-settings-v1";

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage evtl. nicht verfügbar (privater Modus) - bewusst ignoriert
  }
}
