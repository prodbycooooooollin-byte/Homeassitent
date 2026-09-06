// Zentrale Domain-Typen der Smart-Home-App.
// Diese Typen bilden die Brücke zwischen UI, Mock-Daten und einer späteren
// echten Home-Assistant-Anbindung (REST/WebSocket) - siehe lib/ha/*.

export type DeviceType =
  | "outlet"
  | "light"
  | "heating"
  | "appliance"
  | "computer"
  | "sensor"
  | "other";

export type DeviceStatus = "active" | "standby" | "offline" | "error";

export interface Device {
  id: string;
  entityId: string; // ha-kompatible entity_id, z.B. switch.heizstab
  name: string;
  roomId: string;
  type: DeviceType;
  status: DeviceStatus;
  controllable: boolean;
  isOn: boolean;
  currentPowerW: number;
  todayEnergyKwh: number;
  lastChanged: string; // ISO timestamp
  icon: string; // lucide icon name
  timerMinutesLeft?: number;
  scheduleLabel?: string;
  automationIds?: string[];
  history?: EnergyPoint[];
}

export type ClimateMode = "off" | "auto" | "heat" | "eco";
export type HeatingStatus = "idle" | "heating" | "off";

export interface Room {
  id: string;
  name: string;
  icon: string;
  temperature: number;
  targetTemperature: number;
  humidity: number;
  heatingStatus: HeatingStatus;
  windowOpen?: boolean;
  mode: ClimateMode;
  currentPowerW: number;
  warnings?: string[];
  history?: TemperaturePoint[];
}

export interface TemperaturePoint {
  time: string;
  temperature: number;
  target: number;
}

export interface EnergyPoint {
  time: string;
  value: number; // kW oder kWh je nach Kontext
  previous?: number;
}

export type TimeRange = "live" | "today" | "week" | "month" | "year";

export interface WaterHeater {
  id: string;
  isOn: boolean;
  currentPowerW: number;
  waterTemperature: number;
  targetTemperature: number;
  runtimeMinutesToday: number;
  timerMinutesLeft: number | null;
  manualOverride: boolean;
}

export interface WeatherInfo {
  temperature: number;
  description: string;
  icon: "sun" | "cloud" | "cloud-rain" | "cloud-snow" | "cloud-lightning" | "moon" | "cloud-moon";
  humidity: number;
  windKmh: number;
}

export type QuickActionType =
  | "waterheater"
  | "heating"
  | "lights"
  | "outlets"
  | "away"
  | "night"
  | "all-off";

export interface QuickAction {
  id: string;
  type: QuickActionType;
  label: string;
  icon: string;
  active: boolean;
  requiresConfirm?: boolean;
  visible: boolean;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  lastRun: string | null;
  trigger: string;
  condition?: string;
  action: string;
}

export type SecurityKind = "contact" | "motion" | "smoke" | "water" | "camera";

export interface SecurityEntity {
  id: string;
  kind: SecurityKind;
  name: string;
  roomId: string;
  state: "clear" | "open" | "detected" | "alert" | "online" | "offline";
  lastChanged: string;
}

export interface SecurityEvent {
  id: string;
  timestamp: string;
  message: string;
  severity: "info" | "warning" | "critical";
}

export type AlarmMode = "disarmed" | "home" | "away" | "night";

export interface Hint {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  timestamp: string;
}

export interface HouseStatus {
  currentPowerKw: number;
  todayEnergyKwh: number;
  gridPowerKw: number; // positiv = Bezug, negativ = Einspeisung
  activeDevicesCount: number;
  solarPowerKw?: number;
  batteryPercent?: number;
  batteryPowerKw?: number; // positiv = laden, negativ = entladen
  // Tagessummen für die Energie-Seite (nur relevant wenn Solar/Batterie aktiv)
  solarTodayKwh?: number;
  selfConsumptionTodayKwh?: number;
  feedInTodayKwh?: number;
  gridImportTodayKwh?: number;
  autarkyPercent?: number;
}

export interface EnergyByCategory {
  label: string;
  valueKwh: number;
  color: string;
}

export type ConnectionStatus = "connected" | "connecting" | "disconnected" | "demo";

export interface AppSettings {
  houseName: string;
  pricePerKwh: number;
  currency: "EUR" | "USD" | "CHF";
  haUrl: string;
  haTokenConfigured: boolean; // Token selbst wird nie im Client gespeichert
  demoMode: boolean;
  solarEnabled: boolean;
  batteryEnabled: boolean;
  quickActionIds: QuickActionType[];
  theme: "dark" | "light";
  language: "de" | "en";
  notificationsEnabled: boolean;
}
