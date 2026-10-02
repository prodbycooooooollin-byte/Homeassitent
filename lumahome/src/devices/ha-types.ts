// Schnittstellentypen nach der Home-Assistant-WebSocket-API
// (https://developers.home-assistant.io/docs/api/websocket).

export interface HaContext {
  id: string;
  parent_id?: string | null;
  user_id?: string | null;
}

export interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
  /** Seit HA 2024.3: wird auch bei unverändertem Wert aktualisiert */
  last_reported?: string;
  context?: HaContext;
}

export interface HaEntityRegistryEntry {
  entity_id: string;
  area_id: string | null;
  device_id: string | null;
  name: string | null;
  original_name?: string | null;
  disabled_by?: string | null;
  hidden_by?: string | null;
}

export interface HaArea {
  area_id: string;
  name: string;
}

export interface HaDevice {
  id: string;
  name: string | null;
  name_by_user?: string | null;
  area_id: string | null;
  manufacturer?: string | null;
  model?: string | null;
}

export interface HaRegistry {
  entities: HaEntityRegistryEntry[];
  areas: HaArea[];
  devices: HaDevice[];
  /** false, wenn das Konto keine Admin-Rechte für die Registry hat */
  available: boolean;
}

export interface HaStatisticMeta {
  statistic_id: string;
  has_mean?: boolean;
  has_sum?: boolean;
  mean_type?: number;
  statistics_unit_of_measurement: string | null;
  unit_class?: string | null;
  name?: string | null;
  source?: string;
}

export interface HaStatisticRow {
  /** Beginn der Periode (ms seit Epoche) */
  start: number;
  end: number;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
  sum?: number | null;
  state?: number | null;
  change?: number | null;
}

export type HaStatistics = Record<string, HaStatisticRow[]>;

/** Kompakte Verlaufsdaten (history/history_during_period mit minimal_response) */
export interface HaHistoryPoint {
  /** Zustand */
  s: string;
  /** last_updated in Sekunden seit Epoche */
  lu: number;
}

export type HaHistory = Record<string, HaHistoryPoint[]>;

export interface HaEnergyPrefs {
  energy_sources: Array<{
    type: "grid" | "solar" | "battery" | "gas" | "water";
    flow_from?: Array<{ stat_energy_from: string }>;
    flow_to?: Array<{ stat_energy_to: string }>;
    stat_energy_from?: string;
    stat_energy_to?: string;
    stat_rate?: string;
  }>;
  device_consumption: Array<{ stat_consumption: string; name?: string; included_in_stat?: string }>;
}

/** Dienste, die LumaHome aufrufen darf. Der Server lehnt alles andere ab. */
export const ALLOWED_SERVICES: Record<string, readonly string[]> = {
  light: ["turn_on", "turn_off", "toggle"],
  switch: ["turn_on", "turn_off", "toggle"],
  cover: ["open_cover", "close_cover", "stop_cover", "set_cover_position", "open_cover_tilt", "close_cover_tilt"],
  climate: ["set_hvac_mode", "set_temperature", "turn_on", "turn_off"],
};

export function isAllowedService(domain: string, service: string): boolean {
  return ALLOWED_SERVICES[domain]?.includes(service) ?? false;
}
