// Schnittstelle zwischen der UI und einer Home-Assistant-Datenquelle.
// Zwei Implementierungen existieren:
//  - mock-client.ts   -> realistische Demo-Daten, kein Netzwerk nötig
//  - real-client.ts   -> Anbindung an eine echte HA-Instanz (REST + WebSocket)
// Die UI kennt nur dieses Interface, nie die konkrete Implementierung.

import type {
  AlarmMode,
  Automation,
  ClimateMode,
  ConnectionStatus,
  Device,
  EnergyByCategory,
  EnergyPoint,
  Hint,
  HouseStatus,
  QuickAction,
  Room,
  SecurityEntity,
  SecurityEvent,
  TimeRange,
  WaterHeater,
  WeatherInfo,
} from "../types";

export interface AppSnapshot {
  rooms: Room[];
  devices: Device[];
  houseStatus: HouseStatus;
  waterHeater: WaterHeater;
  weather: WeatherInfo;
  hints: Hint[];
  automations: Automation[];
  quickActions: QuickAction[];
  securityEntities: SecurityEntity[];
  securityEvents: SecurityEvent[];
  alarmMode: AlarmMode;
}

export type SnapshotListener = (snapshot: AppSnapshot) => void;
export type StatusListener = (status: ConnectionStatus) => void;

export class HaServiceError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "HaServiceError";
  }
}

export interface HaClient {
  connect(): Promise<void>;
  disconnect(): void;
  getStatus(): ConnectionStatus;
  onStatusChange(listener: StatusListener): () => void;
  getSnapshot(): Promise<AppSnapshot>;
  subscribe(listener: SnapshotListener): () => void;

  // Geräte
  setDevicePower(deviceId: string, on: boolean): Promise<void>;
  setDeviceTimer(deviceId: string, minutes: number | null): Promise<void>;
  setDeviceRoom(deviceId: string, roomId: string): Promise<void>;

  // Klima
  setRoomTargetTemperature(roomId: string, target: number): Promise<void>;
  setRoomMode(roomId: string, mode: ClimateMode): Promise<void>;

  // Warmwasser / Heizstab
  setWaterHeaterPower(on: boolean): Promise<void>;
  setWaterHeaterTimer(minutes: number | null): Promise<void>;
  setWaterHeaterTarget(target: number): Promise<void>;

  // Schnellaktionen & Automationen
  runQuickAction(actionId: string): Promise<void>;
  setAutomationEnabled(automationId: string, enabled: boolean): Promise<void>;
  createAutomation(automation: Automation): Promise<void>;

  // Sicherheit
  setAlarmMode(mode: string): Promise<void>;

  // Historische Energiedaten (für Diagramme)
  getEnergyHistory(range: TimeRange): Promise<EnergyPoint[]>;
  getEnergyBreakdown(): Promise<{ byDevice: EnergyByCategory[]; byRoom: EnergyByCategory[] }>;
}
