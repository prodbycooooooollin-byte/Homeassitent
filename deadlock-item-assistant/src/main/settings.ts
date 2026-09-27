import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Hotkeys { details: string; edit: string; toggle: string; control: string }

export interface AppSettings {
  source: 'demo' | 'manual' | 'spectator';
  demoScenario: string;
  demoAutoBuy: boolean;
  spectator: { baseUrl: string; matchId: string; accountId: string };
  language: string;
  overlay: {
    /** Position relativ zum Arbeitsbereich des Monitors (0..1), damit DPI-/Auflösungswechsel robust sind */
    displayId: number | null;
    relX: number | null;
    relY: number | null;
    scale: number;
    opacity: number;
    visible: boolean;
    expanded: boolean;
    acrylic: boolean;
    reducedMotion: 'system' | 'on' | 'off';
    alertSeconds: number;
  };
  hotkeys: Hotkeys;
}

export const DEFAULT_SETTINGS: AppSettings = {
  source: 'demo',
  demoScenario: 'infernus-lead',
  demoAutoBuy: true,
  spectator: { baseUrl: 'http://localhost:3000', matchId: '', accountId: '' },
  language: 'english',
  overlay: { displayId: null, relX: null, relY: null, scale: 1, opacity: 0.92, visible: true, expanded: false, acrylic: false, reducedMotion: 'system', alertSeconds: 9 },
  hotkeys: { details: 'CommandOrControl+Shift+D', edit: 'CommandOrControl+Shift+E', toggle: 'CommandOrControl+Shift+O', control: 'CommandOrControl+Shift+K' },
};

export function loadSettings(file: string): AppSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS, ...raw,
      spectator: { ...DEFAULT_SETTINGS.spectator, ...(raw.spectator ?? {}) },
      overlay: { ...DEFAULT_SETTINGS.overlay, ...(raw.overlay ?? {}) },
      hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...(raw.hotkeys ?? {}) },
    };
  } catch { return structuredClone(DEFAULT_SETTINGS); }
}

export function saveSettings(file: string, s: AppSettings) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(s, null, 2)); } catch { /* nicht kritisch */ }
}
