// Profile, Profil-Mixer und portable Exporte.

import { SETTINGS, SETTINGS_BY_ID, validateValue, type SettingGroup } from './catalog.ts';

export const PROFILE_SCHEMA = 1;

export type ProfileOriginType =
  | 'local' // aus den eigenen Dateien gespeichert
  | 'custom' // selbst erstellt / gemischt
  | 'import' // aus einer importierten Datei
  | 'player-compiled' // aus veröffentlichten Einzelwerten eines Spielers zusammengestellt
  | 'player-original'; // belegte Original-Config eines Spielers (nur bei belegter Zuordnung)

export type ValueOrigin = 'user' | 'player' | 'advisor' | 'import' | 'local';

export interface ConfigProfile {
  schema: number;
  id: string;
  name: string;
  goal?: 'competitive' | 'ausgewogen' | 'bildqualitaet' | 'eigene';
  createdAt: string;
  updatedAt: string;
  values: Record<string, string>;
  valueOrigins?: Record<string, ValueOrigin>;
  bindings?: Record<string, string>;
  origin: { type: ProfileOriginType; label: string; sourceUrls?: string[]; playerId?: string };
  notes?: string;
  /** Vom Nutzer bestätigt funktionierend (oder durch Spielstart-Prüfung). */
  confirmedWorking?: { at: string; how: 'user' | 'game-kept-values' };
}

export function newId(prefix = 'p'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function createProfile(name: string, values: Record<string, string>, origin: ConfigProfile['origin'], goal?: ConfigProfile['goal']): ConfigProfile {
  const now = new Date().toISOString();
  return { schema: PROFILE_SCHEMA, id: newId(), name, goal, createdAt: now, updatedAt: now, values: { ...values }, origin };
}

export function duplicateProfile(p: ConfigProfile, name?: string): ConfigProfile {
  const now = new Date().toISOString();
  return { ...structuredClone(p), id: newId(), name: name || `${p.name} (Kopie)`, createdAt: now, updatedAt: now, confirmedWorking: undefined, origin: { ...p.origin, type: p.origin.type === 'player-original' ? 'player-compiled' : p.origin.type } };
}

export function valuesInGroups(values: Record<string, string>, groups: SettingGroup[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, v] of Object.entries(values)) {
    const def = SETTINGS_BY_ID.get(id);
    if (def && groups.includes(def.group) && def.portable) out[id] = v;
  }
  return out;
}

export interface MixSource {
  profile: ConfigProfile;
  groups: SettingGroup[];
}

export interface MixConflict {
  settingId: string;
  label: string;
  candidates: { profileId: string; profileName: string; value: string }[];
}

export interface MixResult {
  values: Record<string, string>;
  origins: Record<string, string>;
  conflicts: MixConflict[];
}

/** Kombiniert Bereiche aus mehreren Profilen. Überschneidungen mit unterschiedlichen Werten werden als Konflikt gemeldet. */
export function mixProfiles(sources: MixSource[], resolutions: Record<string, string> = {}): MixResult {
  const claims = new Map<string, { profileId: string; profileName: string; value: string }[]>();
  for (const s of sources) {
    for (const [id, v] of Object.entries(valuesInGroups(s.profile.values, s.groups))) {
      claims.set(id, [...(claims.get(id) || []), { profileId: s.profile.id, profileName: s.profile.name, value: v }]);
    }
  }
  const values: Record<string, string> = {};
  const origins: Record<string, string> = {};
  const conflicts: MixConflict[] = [];
  for (const [id, list] of claims) {
    const distinct = new Set(list.map((c) => c.value));
    if (distinct.size > 1) {
      const chosen = resolutions[id];
      const c = list.find((x) => x.profileId === chosen);
      if (c) {
        values[id] = c.value;
        origins[id] = c.profileId;
      } else conflicts.push({ settingId: id, label: SETTINGS_BY_ID.get(id)?.label || id, candidates: list });
      continue;
    }
    values[id] = list[0].value;
    origins[id] = list[0].profileId;
  }
  return { values, origins, conflicts };
}

export interface ProfileComparisonRow {
  settingId: string;
  label: string;
  group: SettingGroup;
  a?: string;
  b?: string;
  same: boolean;
}

export function compareProfiles(a: Record<string, string>, b: Record<string, string>): ProfileComparisonRow[] {
  return SETTINGS.filter((s) => a[s.id] !== undefined || b[s.id] !== undefined).map((s) => ({
    settingId: s.id,
    label: s.label,
    group: s.group,
    a: a[s.id],
    b: b[s.id],
    same: a[s.id] === b[s.id],
  }));
}

/** Öffentlicher Export: nur portable, gültige Werte; keine Pfade, IDs oder Diagnosedaten. */
export function portableExport(p: ConfigProfile): object {
  const values: Record<string, string> = {};
  for (const [id, v] of Object.entries(p.values)) {
    const def = SETTINGS_BY_ID.get(id);
    if (!def || !def.portable) continue;
    if (!validateValue(def, v).ok) continue;
    values[id] = v;
  }
  return {
    format: 'citadel-profile',
    schema: PROFILE_SCHEMA,
    name: p.name,
    goal: p.goal,
    values,
    bindings: p.bindings,
    originLabel: p.origin.type === 'player-original' ? p.origin.label : p.origin.type === 'player-compiled' ? 'Aus veröffentlichten Einstellungen zusammengestellt' : undefined,
    exportedAt: new Date().toISOString().slice(0, 10),
  };
}

export function importPortable(json: unknown): ConfigProfile {
  const o = json as { format?: string; schema?: number; name?: string; values?: Record<string, unknown>; bindings?: Record<string, string>; goal?: ConfigProfile['goal'] };
  if (!o || o.format !== 'citadel-profile') throw new Error('Keine CITADEL-Profildatei');
  if (o.schema !== PROFILE_SCHEMA) throw new Error(`Profilschema ${o.schema} wird nicht unterstützt`);
  const values: Record<string, string> = {};
  for (const [id, v] of Object.entries(o.values || {})) {
    const def = SETTINGS_BY_ID.get(id);
    if (!def || !def.portable || typeof v !== 'string') continue;
    if (validateValue(def, v).ok) values[id] = v;
  }
  const p = createProfile(String(o.name || 'Importiertes Profil').slice(0, 80), values, { type: 'import', label: 'Profil-Import' }, o.goal);
  if (o.bindings && typeof o.bindings === 'object') {
    p.bindings = Object.fromEntries(Object.entries(o.bindings).filter(([k, v]) => typeof v === 'string' && /^[\w]+$/.test(k) && !/[;\n]/.test(v)).slice(0, 200));
  }
  return p;
}
