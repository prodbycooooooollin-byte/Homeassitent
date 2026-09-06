// Anbindung an eine echte Home-Assistant-Instanz.
//
// WICHTIG: Das Zugriffstoken wird NIE im Frontend gespeichert oder von hier
// aus direkt an Home Assistant gesendet. Stattdessen läuft jeder Aufruf über
// die serverseitige Route app/api/ha/[...path]/route.ts, die das Token aus
// Umgebungsvariablen (HA_URL, HA_TOKEN) liest und die Anfrage weiterleitet.
// So bleibt das Token ausschließlich auf dem Server.
//
// Home-Assistant-REST-API-Referenz: GET/POST /api/states, /api/services/<domain>/<service>
// Für Live-Updates würde man zusätzlich die HA-WebSocket-API
// (auth -> subscribe_events / subscribe_trigger) serverseitig terminieren und
// die Ergebnisse per Server-Sent-Events oder eigenem WebSocket an den Client
// weiterreichen. Diese Klasse ist so vorbereitet, dass ein solcher Kanal
// (this.connectRealtime) ohne API-Änderungen ergänzt werden kann.

import type { Automation, ConnectionStatus, ClimateMode, EnergyByCategory, EnergyPoint, TimeRange } from "../types";
import type { AppSnapshot, HaClient, SnapshotListener, StatusListener } from "./types";
import { HaServiceError } from "./types";

const API_BASE = "/api/ha";
const POLL_INTERVAL_MS = 5000;

export class RealHaClient implements HaClient {
  private status: ConnectionStatus = "disconnected";
  private statusListeners = new Set<StatusListener>();
  private snapshotListeners = new Set<SnapshotListener>();
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  async connect(): Promise<void> {
    this.setStatus("connecting");
    try {
      const res = await fetch(`${API_BASE}/ping`);
      if (!res.ok) throw new Error(`HA nicht erreichbar (${res.status})`);
      this.setStatus("connected");
      this.pollHandle = setInterval(() => this.pollSnapshot(), POLL_INTERVAL_MS);
    } catch (err) {
      this.setStatus("disconnected");
      throw new HaServiceError("Verbindung zu Home Assistant fehlgeschlagen", err);
    }
  }

  disconnect(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.pollHandle = null;
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
    const res = await fetch(`${API_BASE}/snapshot`);
    if (!res.ok) throw new HaServiceError("Snapshot konnte nicht geladen werden");
    return (await res.json()) as AppSnapshot;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  async setDevicePower(deviceId: string, on: boolean): Promise<void> {
    await this.callService("switch", on ? "turn_on" : "turn_off", { entity_id: deviceId });
  }

  async setDeviceTimer(deviceId: string, minutes: number | null): Promise<void> {
    await this.callService("timer", minutes ? "start" : "cancel", {
      entity_id: deviceId,
      duration: minutes ? `00:${String(minutes).padStart(2, "0")}:00` : undefined,
    });
  }

  async setDeviceRoom(deviceId: string, roomId: string): Promise<void> {
    // Home Assistant verwaltet Raum-Zuordnungen über die Entity-Registry
    // (config/entity_registry/update), nicht über einen Service-Call.
    // Für die reale Anbindung müsste dies serverseitig via /api/ha/entity
    // auf die Registry abgebildet werden.
    await this.callService("homeassistant", "update_entity", { entity_id: deviceId, area_id: roomId });
  }

  async setRoomTargetTemperature(roomId: string, target: number): Promise<void> {
    await this.callService("climate", "set_temperature", { entity_id: roomId, temperature: target });
  }

  async setRoomMode(roomId: string, mode: ClimateMode): Promise<void> {
    const hvacMode = mode === "off" ? "off" : mode === "heat" ? "heat" : mode === "eco" ? "auto" : "auto";
    await this.callService("climate", "set_hvac_mode", { entity_id: roomId, hvac_mode: hvacMode });
  }

  async setWaterHeaterPower(on: boolean): Promise<void> {
    await this.callService("switch", on ? "turn_on" : "turn_off", { entity_id: "switch.heizstab_warmwasser" });
  }

  async setWaterHeaterTimer(minutes: number | null): Promise<void> {
    await this.callService("timer", minutes ? "start" : "cancel", {
      entity_id: "timer.heizstab_warmwasser",
      duration: minutes ? `00:${String(minutes).padStart(2, "0")}:00` : undefined,
    });
  }

  async setWaterHeaterTarget(target: number): Promise<void> {
    await this.callService("water_heater", "set_temperature", {
      entity_id: "water_heater.heizstab",
      temperature: target,
    });
  }

  async runQuickAction(actionId: string): Promise<void> {
    await this.callService("script", "turn_on", { entity_id: `script.${actionId}` });
  }

  async setAutomationEnabled(automationId: string, enabled: boolean): Promise<void> {
    await this.callService("automation", enabled ? "turn_on" : "turn_off", { entity_id: automationId });
  }

  async setAlarmMode(mode: string): Promise<void> {
    const serviceMap: Record<string, string> = {
      disarmed: "alarm_disarm",
      home: "alarm_arm_home",
      away: "alarm_arm_away",
      night: "alarm_arm_night",
    };
    await this.callService("alarm_control_panel", serviceMap[mode] ?? "alarm_disarm", {
      entity_id: "alarm_control_panel.haus",
    });
  }

  async createAutomation(automation: Automation): Promise<void> {
    // Home Assistant verwaltet Automationen üblicherweise über die
    // automation-Konfiguration/-API bzw. das Config-Flow. Für die reale
    // Anbindung müsste dies serverseitig auf config/automation/config
    // abgebildet werden.
    await this.callService("automation", "reload", { entity_id: automation.id });
  }

  async getEnergyHistory(range: TimeRange): Promise<EnergyPoint[]> {
    const res = await fetch(`${API_BASE}/history?range=${range}`);
    if (!res.ok) throw new HaServiceError("Energieverlauf konnte nicht geladen werden");
    return (await res.json()) as EnergyPoint[];
  }

  async getEnergyBreakdown(): Promise<{ byDevice: EnergyByCategory[]; byRoom: EnergyByCategory[] }> {
    const res = await fetch(`${API_BASE}/breakdown`);
    if (!res.ok) throw new HaServiceError("Aufschlüsselung konnte nicht geladen werden");
    return (await res.json()) as { byDevice: EnergyByCategory[]; byRoom: EnergyByCategory[] };
  }

  private async pollSnapshot() {
    try {
      const snapshot = await this.getSnapshot();
      this.snapshotListeners.forEach((l) => l(snapshot));
      if (this.status !== "connected") this.setStatus("connected");
    } catch {
      this.setStatus("disconnected");
    }
  }

  private async callService(domain: string, service: string, data: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${API_BASE}/services/${domain}/${service}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new HaServiceError(`Befehl fehlgeschlagen (${domain}.${service})`);
    }
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.statusListeners.forEach((l) => l(status));
  }
}
