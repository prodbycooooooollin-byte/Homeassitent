// Client für die zentrale Recherche-API (v1). Antworten werden lokal zwischengespeichert,
// damit die App offline den letzten Stand (mit Datum) zeigen kann.

import { platform } from '../platform/index.ts';
import type { ChangeEventDto, ConfigArtifactDto, CoverageDto, PlayerDto } from '../core/models.ts';

export const DEFAULT_API = import.meta.env.VITE_CITADEL_API || 'http://127.0.0.1:8787';

export interface Cached<T> {
  data: T;
  fetchedAt: string;
  offline: boolean;
  error?: string;
}

async function getJson<T>(base: string, path: string, cacheId: string): Promise<Cached<T>> {
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}${path}`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as T;
    const entry = { data, fetchedAt: new Date().toISOString() };
    void platform.store.put('players-cache', cacheId, entry);
    return { ...entry, offline: false };
  } catch (e) {
    const cached = await platform.store.get<{ data: T; fetchedAt: string }>('players-cache', cacheId);
    if (cached) return { ...cached, offline: true, error: (e as Error).message };
    throw new Error(`Recherche-Dienst nicht erreichbar (${(e as Error).message}) und kein lokaler Stand vorhanden.`);
  }
}

export const api = {
  status: (base: string) => getJson<{ api: string; coverage: CoverageDto }>(base, '/v1/status', 'status'),
  players: (base: string, q = '', category = '') =>
    getJson<{ players: PlayerDto[] }>(base, `/v1/players?limit=200${q ? `&q=${encodeURIComponent(q)}` : ''}${category ? `&category=${category}` : ''}`, `players-${category}-${q.replace(/[^\w-]/g, '_').slice(0, 40)}`),
  player: (base: string, id: string) => getJson<PlayerDto>(base, `/v1/players/${encodeURIComponent(id)}`, `player-${id.replace(/[^\w-]/g, '_')}`),
  changes: (base: string, since: number, players: string[]) =>
    getJson<{ changes: ChangeEventDto[] }>(base, `/v1/changes?since=${since}${players.length ? `&players=${players.join(',')}` : ''}`, `changes-${players.length ? 'followed' : 'all'}`),
  artifacts: (base: string) => getJson<{ artifacts: (ConfigArtifactDto & { playerId: string | null })[] }>(base, '/v1/config-artifacts', 'artifacts'),
  async artifactRaw(base: string, id: string): Promise<string> {
    const res = await fetch(`${base.replace(/\/+$/, '')}/v1/config-artifacts/${encodeURIComponent(id)}/raw`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },
};

export const FIELD_LABEL: Record<string, string> = {
  crosshair: 'Crosshair',
  dpi: 'DPI',
  sensitivity: 'Ingame-Sensitivität',
  zoom_sensitivity_ratio: 'Zoom-Sensitivität',
  resolution: 'Auflösung',
  fov: 'FOV',
  fps_max: 'FPS-Limit',
};

export function fieldLabel(f: string): string {
  if (FIELD_LABEL[f]) return FIELD_LABEL[f];
  if (f.startsWith('video.')) return `Grafik: ${f.slice(6)}`;
  if (f.startsWith('keybind.')) return `Taste ${f.slice(8)}`;
  if (f.startsWith('config:')) return `Config-Datei ${f.slice(7)}`;
  return f;
}

export const ORIGIN_LABEL: Record<string, string> = {
  'auto-primary': 'Automatisch aus Primärquelle',
  'third-party': 'Drittanbieterangabe',
  'manual-confirmed': 'Manuell bestätigt',
};
