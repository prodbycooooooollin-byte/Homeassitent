// Validierung extrahierter Kandidaten: Einheiten, Wertebereiche, Datum, Spielbezug.
// Sensitivität, DPI und Zoom werden getrennt gespeichert; es gibt keine Umrechnung.

import { findSetting, SETTINGS, validateValue } from '../../src/core/catalog.ts';

export const EXTRACTOR_VERSION_RULES = 'rules-1';

export interface Candidate {
  field: string;
  value: string;
  unit?: string | null;
  context?: string;
  evidence: string;
  /** Die Fundstelle bezieht sich nachweislich auf Deadlock (Seite/Datei/Abschnitt). */
  gameConfirmed: boolean;
  publishedAt?: string | null;
}

export interface Validated extends Candidate {
  validation: 'valid' | 'invalid' | 'unclear';
  reason?: string;
  normalizedValue: string;
}

export const FIELD_LABELS: Record<string, string> = {
  crosshair: 'Crosshair',
  dpi: 'DPI',
  sensitivity: 'Ingame-Sensitivität',
  zoom_sensitivity_ratio: 'Zoom-Sensitivität',
  resolution: 'Auflösung',
  fov: 'FOV',
  fps_max: 'FPS-Limit',
};

export function validateCandidate(c: Candidate, now = new Date()): Validated {
  const base = { ...c, normalizedValue: c.value.trim() };
  const bad = (reason: string): Validated => ({ ...base, validation: 'invalid', reason });
  const unclear = (reason: string): Validated => ({ ...base, validation: 'unclear', reason });
  if (!c.gameConfirmed) return unclear('Bezug zu Deadlock nicht belegt');
  if (!c.evidence || c.evidence.length < 3) return bad('Kein Beleg (Fundstelle) vorhanden');
  if (c.publishedAt) {
    const t = Date.parse(c.publishedAt);
    if (!Number.isFinite(t)) base.publishedAt = null;
    else if (t > now.getTime() + 86400_000) return bad('Veröffentlichungsdatum liegt in der Zukunft');
  }
  const v = base.normalizedValue;
  switch (c.field) {
    case 'dpi': {
      if (!/^\d{2,5}$/.test(v)) return bad('DPI muss eine ganze Zahl sein');
      const n = Number(v);
      if (n < 50 || n > 64000) return bad('DPI außerhalb 50–64000');
      return { ...base, unit: 'dpi', validation: 'valid' };
    }
    case 'sensitivity':
    case 'zoom_sensitivity_ratio': {
      const def = findSetting('autoexec.cfg', c.field)!;
      const r = validateValue(def, v.replace(',', '.'));
      if (!r.ok) return bad(`${c.field}: ${r.message}`);
      return { ...base, normalizedValue: r.normalized!, unit: null, context: c.field === 'sensitivity' ? 'ingame' : 'zoom', validation: 'valid' };
    }
    case 'resolution': {
      const m = /^(\d{3,5})\s*[x×]\s*(\d{3,5})$/i.exec(v);
      if (!m) return bad('Auflösung im Format BREITExHÖHE erwartet');
      return { ...base, normalizedValue: `${m[1]}x${m[2]}`, unit: 'px', validation: 'valid' };
    }
    case 'fps_max': {
      if (!/^\d{1,4}$/.test(v)) return bad('FPS-Limit muss ganzzahlig sein');
      return { ...base, validation: 'valid' };
    }
    case 'fov': {
      // Nur die belegte ConVar; Kontext (welcher Wert/welche Achse) muss angegeben sein.
      if (c.context !== 'citadel_camera_hero_fov') return unclear('FOV ohne belegten Kontext (ConVar/Achse) – nicht übernommen');
      const def = findSetting('gameinfo.gi', 'citadel_camera_hero_fov')!;
      const r = validateValue(def, v);
      return r.ok ? { ...base, validation: 'valid' } : bad(r.message!);
    }
    case 'crosshair': {
      let obj: Record<string, string>;
      try {
        obj = JSON.parse(v);
      } catch {
        return bad('Crosshair muss als ConVar-Zuordnung vorliegen');
      }
      const keys = Object.keys(obj);
      if (!keys.length) return bad('Leeres Crosshair');
      for (const k of keys) {
        const def = SETTINGS.find((s) => s.key === k && s.group === 'crosshair');
        if (!def) return bad(`Unbekannte Crosshair-ConVar ${k}`);
        const r = validateValue(def, obj[k]);
        if (!r.ok) return bad(`${k}: ${r.message}`);
        obj[k] = r.normalized!;
      }
      const sorted = Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
      return { ...base, normalizedValue: JSON.stringify(sorted), validation: 'valid' };
    }
    default: {
      if (c.field.startsWith('video.')) {
        const def = findSetting('video.txt', c.field.slice(6));
        if (!def) return bad('Unbekannte Video-Einstellung');
        if (!def.portable) return bad('Gerätespezifischer Wert – wird nicht gespeichert');
        const r = validateValue(def, v);
        return r.ok ? { ...base, normalizedValue: r.normalized!, validation: 'valid' } : bad(r.message!);
      }
      if (c.field.startsWith('keybind.')) {
        if (!/^[+\-]?[a-z_]+$/i.test(v)) return bad('Nur einfache Befehle als Tastenbelegung');
        return { ...base, validation: 'valid' };
      }
      return bad(`Unbekanntes Feld ${c.field}`);
    }
  }
}
