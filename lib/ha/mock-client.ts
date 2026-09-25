// Demo-Implementierung des HaClient-Interfaces.
// Simuliert Netzwerk-Latenz, gelegentliche Fehler und Live-Updates, damit
// sich die gesamte App realistisch bedienen lässt - ganz ohne echte
// Home-Assistant-Instanz.

import type { ConnectionStatus, ClimateMode, TimeRange } from "../types";
import {
  MOCK_ALARM_MODE,
  MOCK_AUTOMATIONS,
  MOCK_DEVICES,
  MOCK_ENERGY_BY_DEVICE,
  MOCK_ENERGY_BY_ROOM,
  MOCK_HINTS,
  MOCK_HOUSE_STATUS,
  MOCK_QUICK_ACTIONS,
  MOCK_ROOMS,
  MOCK_SECURITY_ENTITIES,
  MOCK_SECURITY_EVENTS,
  MOCK_WATER_HEATER,
  MOCK_WEATHER,
  generateEnergySeries,
} from "../mock-data";
import type { AppSnapshot, HaClient, SnapshotListener, StatusListener } from "./types";
import { HaServiceError } from "./types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LATENCY_MS = 420;
const FAILURE_RATE = 0.06; // ~6% simulierte Fehlschläge, für Rollback-Demo der optimistischen UI

export class MockHaClient implements HaClient {
  private status: ConnectionStatus = "demo";
  private statusListeners = new Set<StatusListener>();
  private snapshotListeners = new Set<SnapshotListener>();
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  private state: AppSnapshot = {
    rooms: clone(MOCK_ROOMS),
    devices: clone(MOCK_DEVICES),
    houseStatus: clone(MOCK_HOUSE_STATUS),
    waterHeater: clone(MOCK_WATER_HEATER),
    weather: clone(MOCK_WEATHER),
    hints: clone(MOCK_HINTS),
    automations: clone(MOCK_AUTOMATIONS),
    quickActions: clone(MOCK_QUICK_ACTIONS),
    securityEntities: clone(MOCK_SECURITY_ENTITIES),
    securityEvents: clone(MOCK_SECURITY_EVENTS),
    alarmMode: MOCK_ALARM_MODE,
  };

  async connect(): Promise<void> {
    this.setStatus("connecting");
    await delay(500);
    this.setStatus("demo");
    if (!this.tickHandle) {
      this.tickHandle = setInterval(() => this.tick(), 4000);
    }
  }

  disconnect(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.tickHandle = null;
    this.setStatus("disconnected");
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  async getSnapshot(): Promise<AppSnapshot> {
    await delay(300);
    return clone(this.state);
  }

  subscribe(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  async setDevicePower(deviceId: string, on: boolean): Promise<void> {
    await this.simulateCall(() => {
      const device = this.state.devices.find((d) => d.id === deviceId);
      if (!device) throw new HaServiceError("Gerät nicht gefunden");
      device.isOn = on;
      device.status = on ? "active" : "standby";
      device.currentPowerW = on ? Math.max(device.currentPowerW, estimatePower(device.type)) : 0;
      device.lastChanged = new Date().toISOString();
    });
  }

  async setDeviceTimer(deviceId: string, minutes: number | null): Promise<void> {
    await this.simulateCall(() => {
      const device = this.state.devices.find((d) => d.id === deviceId);
      if (!device) throw new HaServiceError("Gerät nicht gefunden");
      device.timerMinutesLeft = minutes ?? undefined;
    });
  }

  async setDeviceRoom(deviceId: string, roomId: string): Promise<void> {
    await this.simulateCall(() => {
      const device = this.state.devices.find((d) => d.id === deviceId);
      if (!device) throw new HaServiceError("Gerät nicht gefunden");
      device.roomId = roomId;
    });
  }

  async setRoomTargetTemperature(roomId: string, target: number): Promise<void> {
    await this.simulateCall(() => {
      const room = this.state.rooms.find((r) => r.id === roomId);
      if (!room) throw new HaServiceError("Raum nicht gefunden");
      room.targetTemperature = target;
      room.heatingStatus = target > room.temperature ? "heating" : "idle";
    });
  }

  async setRoomMode(roomId: string, mode: ClimateMode): Promise<void> {
    await this.simulateCall(() => {
      const room = this.state.rooms.find((r) => r.id === roomId);
      if (!room) throw new HaServiceError("Raum nicht gefunden");
      room.mode = mode;
      room.heatingStatus = mode === "off" ? "off" : room.heatingStatus;
    });
  }

  async setWaterHeaterPower(on: boolean): Promise<void> {
    await this.simulateCall(() => {
      this.state.waterHeater.isOn = on;
      this.state.waterHeater.currentPowerW = on ? 2100 : 0;
    });
  }

  async setWaterHeaterTimer(minutes: number | null): Promise<void> {
    await this.simulateCall(() => {
      this.state.waterHeater.timerMinutesLeft = minutes;
      this.state.waterHeater.manualOverride = minutes === null;
    });
  }

  async setWaterHeaterTarget(target: number): Promise<void> {
    await this.simulateCall(() => {
      this.state.waterHeater.targetTemperature = target;
    });
  }

  async runQuickAction(actionId: string): Promise<void> {
    await this.simulateCall(() => {
      const action = this.state.quickActions.find((a) => a.id === actionId);
      if (!action) throw new HaServiceError("Aktion nicht gefunden");
      action.active = !action.active;

      switch (action.type) {
        case "lights":
          this.state.devices
            .filter((d) => d.type === "light")
            .forEach((d) => {
              d.isOn = action.active;
              d.status = action.active ? "active" : "standby";
            });
          break;
        case "outlets":
          this.state.devices
            .filter((d) => d.type === "outlet")
            .forEach((d) => {
              d.isOn = action.active;
              d.status = action.active ? "active" : "standby";
            });
          break;
        case "heating":
          this.state.rooms.forEach((r) => {
            r.mode = action.active ? "auto" : "off";
          });
          break;
        case "waterheater":
          this.state.waterHeater.isOn = action.active;
          this.state.waterHeater.currentPowerW = action.active ? 2100 : 0;
          break;
        case "all-off":
          this.state.devices.forEach((d) => {
            if (d.controllable) {
              d.isOn = false;
              d.status = "standby";
              d.currentPowerW = 0;
            }
          });
          this.state.waterHeater.isOn = false;
          this.state.waterHeater.currentPowerW = 0;
          break;
        default:
          break;
      }
    });
  }

  async setAutomationEnabled(automationId: string, enabled: boolean): Promise<void> {
    await this.simulateCall(() => {
      const automation = this.state.automations.find((a) => a.id === automationId);
      if (!automation) throw new HaServiceError("Automation nicht gefunden");
      automation.enabled = enabled;
    });
  }

  async setAlarmMode(mode: string): Promise<void> {
    await this.simulateCall(() => {
      this.state.alarmMode = mode as import("../types").AlarmMode;
      this.state.securityEvents = [
        {
          id: `ev-${Date.now()}`,
          timestamp: new Date().toISOString(),
          message: `Alarmmodus auf '${mode}' gesetzt`,
          severity: "info",
        },
        ...this.state.securityEvents,
      ];
    });
  }

  async createAutomation(automation: import("../types").Automation): Promise<void> {
    await this.simulateCall(() => {
      this.state.automations = [automation, ...this.state.automations];
    });
  }

  async getEnergyHistory(range: TimeRange): Promise<import("../types").EnergyPoint[]> {
    await delay(250);
    return generateEnergySeries(range);
  }

  async getEnergyBreakdown() {
    await delay(250);
    return { byDevice: clone(MOCK_ENERGY_BY_DEVICE), byRoom: clone(MOCK_ENERGY_BY_ROOM) };
  }

  private async simulateCall(mutate: () => void): Promise<void> {
    await delay(LATENCY_MS);
    if (Math.random() < FAILURE_RATE) {
      throw new HaServiceError("Befehl konnte nicht ausgeführt werden. Bitte erneut versuchen.");
    }
    mutate();
    this.emitSnapshot();
  }

  private tick() {
    // Leichte, realistische Schwankungen für ein "lebendiges" Dashboard.
    const jitter = (v: number, amount: number) => Math.max(0, v + (Math.random() - 0.5) * amount);
    this.state.houseStatus.currentPowerKw = Math.round(jitter(this.state.houseStatus.currentPowerKw, 0.25) * 100) / 100;
    if (this.state.houseStatus.solarPowerKw !== undefined) {
      this.state.houseStatus.solarPowerKw = Math.round(jitter(this.state.houseStatus.solarPowerKw, 0.3) * 100) / 100;
    }
    this.state.devices
      .filter((d) => d.isOn)
      .forEach((d) => {
        d.currentPowerW = Math.round(jitter(d.currentPowerW, d.currentPowerW * 0.06 + 2));
      });
    this.emitSnapshot();
  }

  private emitSnapshot() {
    const snapshot = clone(this.state);
    this.snapshotListeners.forEach((l) => l(snapshot));
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.statusListeners.forEach((l) => l(status));
  }
}

function estimatePower(type: string): number {
  switch (type) {
    case "heating":
      return 1800;
    case "appliance":
      return 900;
    case "computer":
      return 350;
    case "light":
      return 15;
    case "outlet":
      return 80;
    default:
      return 40;
  }
}
