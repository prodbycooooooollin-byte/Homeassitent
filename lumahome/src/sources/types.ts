// Gemeinsame Schnittstelle für Live-Betrieb (Home Assistant über den lokalen
// LumaHome-Server) und Demo-Betrieb (Simulation im Browser). Beide sind
// technisch getrennt: Demo-Daten können nie in den Live-Betrieb gelangen.
import type { HaEnergyPrefs, HaHistory, HaRegistry, HaState, HaStatisticMeta, HaStatistics } from "@/devices/ha-types";

export type ConnectionStatus =
  | { kind: "demo" }
  | { kind: "connecting" }
  | { kind: "connected"; haVersion: string | null; since: number }
  | { kind: "reconnecting"; reason: string; attempt: number; since: number }
  | { kind: "server_unreachable"; reason: string }
  | { kind: "not_configured" }
  | { kind: "auth_failed"; reason: string }
  | { kind: "forbidden" };

export interface SourceListener {
  onStatus(status: ConnectionStatus): void;
  onSnapshot(states: HaState[], registry: HaRegistry): void;
  onState(entityId: string, state: HaState | null): void;
}

export interface ServiceCall {
  domain: string;
  service: string;
  entityId: string;
  data?: Record<string, unknown>;
}

export interface DeviceSource {
  readonly mode: "demo" | "live";
  start(listener: SourceListener): void;
  stop(): void;
  /** Liefert die Kontext-ID des Aufrufs, um die Bestätigung zuordnen zu können. */
  callService(call: ServiceCall): Promise<{ contextId: string | null }>;
  listStatisticIds(): Promise<HaStatisticMeta[]>;
  statistics(ids: string[], start: number, end: number, period: "5minute" | "hour" | "day", types: ("mean" | "change" | "sum" | "state")[]): Promise<HaStatistics>;
  history(ids: string[], start: number, end: number): Promise<HaHistory>;
  energyPrefs(): Promise<HaEnergyPrefs | null>;
}

/** SSE-Ereignisse vom Server */
export type StreamEvent =
  | { type: "status"; status: ConnectionStatus }
  | { type: "snapshot"; states: HaState[]; registry: HaRegistry }
  | { type: "state"; entity_id: string; new_state: HaState | null };
