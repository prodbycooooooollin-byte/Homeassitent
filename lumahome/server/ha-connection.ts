// Dauerhafte Verbindung des LumaHome-Servers zur Home-Assistant-WebSocket-API.
// Der Zugriffstoken verlässt diesen Prozess nie.
//
// Ablauf: auth → subscribe_events(state_changed) → get_states → Registries.
// Bei Verbindungsabbruch: exponentielles Wiederverbinden (1 s … 30 s) und
// anschließend vollständige Neusynchronisierung (neuer Snapshot).
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { HaRegistry, HaState } from "../src/devices/ha-types";
import type { ConnectionStatus } from "../src/sources/types";
import { config, haConfigured } from "./config";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

export class HaConnection extends EventEmitter {
  status: ConnectionStatus = { kind: "connecting" };
  states = new Map<string, HaState>();
  registry: HaRegistry = { entities: [], areas: [], devices: [], available: false };
  haVersion: string | null = null;
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private attempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private lastPong = Date.now();
  private stopped = false;
  private synced = false;

  start() {
    if (!haConfigured()) {
      this.setStatus({ kind: "not_configured" });
      return;
    }
    this.stopped = false;
    this.open();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.terminate();
  }

  /** Für Tests: Verbindung hart trennen, um das Wiederverbinden zu prüfen. */
  dropForTest() {
    this.ws?.terminate();
  }

  get isSynced() {
    return this.synced && this.status.kind === "connected";
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.emit("status", s);
  }

  private wsUrl() {
    return config.haUrl!.replace(/^http/, "ws") + "/api/websocket";
  }

  private open() {
    if (this.status.kind !== "reconnecting") this.setStatus({ kind: "connecting" });
    const ws = new WebSocket(this.wsUrl(), { rejectUnauthorized: !config.haInsecureTls, handshakeTimeout: 10_000 });
    this.ws = ws;
    ws.on("message", (raw) => this.onMessage(ws, raw.toString()));
    ws.on("error", (err) => {
      this.lastError = err.message;
    });
    ws.on("close", () => {
      if (this.ws !== ws) return;
      this.onClosed(this.lastError ?? "Verbindung beendet");
    });
  }

  private lastError: string | null = null;

  private onClosed(reason: string) {
    this.synced = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Verbindung zu Home Assistant getrennt"));
    }
    this.pending.clear();
    if (this.stopped) return;
    if (this.status.kind === "auth_failed") {
      // Falscher Token: selten erneut versuchen, um HA nicht zu belasten
      this.reconnectTimer = setTimeout(() => this.open(), 60_000);
      return;
    }
    this.attempt++;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.attempt - 1, 5));
    this.setStatus({ kind: "reconnecting", reason, attempt: this.attempt, since: Date.now() });
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private send(ws: WebSocket, msg: object) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  /** Sendet einen Befehl und wartet auf das zugehörige Ergebnis. */
  command<T = unknown>(msg: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || this.status.kind !== "connected") {
      return Promise.reject(new Error("Keine Verbindung zu Home Assistant"));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Zeitüberschreitung bei Home Assistant"));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.send(ws, { ...msg, id });
    });
  }

  private onMessage(ws: WebSocket, raw: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type) {
      case "auth_required":
        this.send(ws, { type: "auth", access_token: config.haToken });
        return;
      case "auth_invalid":
        this.setStatus({ kind: "auth_failed", reason: String(msg.message ?? "Zugriffstoken ungültig") });
        ws.close();
        return;
      case "auth_ok":
        this.haVersion = typeof msg.ha_version === "string" ? msg.ha_version : null;
        this.lastError = null;
        this.attempt = 0;
        this.setStatus({ kind: "connected", haVersion: this.haVersion, since: Date.now() });
        this.startPing(ws);
        void this.sync();
        return;
      case "pong":
        this.lastPong = Date.now();
        this.resolvePending(msg);
        return;
      case "result":
        this.resolvePending(msg);
        return;
      case "event":
        this.onEvent(msg.event as { event_type: string; data: { entity_id: string; new_state: HaState | null } });
        return;
    }
  }

  private resolvePending(msg: Record<string, unknown>) {
    const id = Number(msg.id);
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    if (msg.type === "pong" || msg.success) p.resolve(msg.result);
    else {
      const err = msg.error as { code?: string; message?: string } | undefined;
      p.reject(new Error(err?.message ?? "Home Assistant meldet einen Fehler"));
    }
  }

  private onEvent(ev: { event_type: string; data: { entity_id: string; new_state: HaState | null } }) {
    if (ev?.event_type !== "state_changed") return;
    const { entity_id, new_state } = ev.data;
    if (new_state) this.states.set(entity_id, new_state);
    else this.states.delete(entity_id);
    if (this.synced) this.emit("state", entity_id, new_state);
  }

  private startPing(ws: WebSocket) {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.lastPong = Date.now();
    this.pingTimer = setInterval(() => {
      if (Date.now() - this.lastPong > 45_000) {
        this.lastError = "Keine Antwort von Home Assistant";
        ws.terminate();
        return;
      }
      this.command({ type: "ping" }, 10_000).catch(() => undefined);
    }, 20_000);
  }

  private async sync() {
    try {
      // Erst abonnieren, dann Zustände holen – so geht keine Änderung verloren.
      await this.command({ type: "subscribe_events", event_type: "state_changed" });
      const list = await this.command<HaState[]>({ type: "get_states" }, 30_000);
      const fresh = new Map<string, HaState>();
      for (const s of list) {
        const known = this.states.get(s.entity_id);
        fresh.set(s.entity_id, known && known.last_updated > s.last_updated ? known : s);
      }
      this.states = fresh;
      this.registry = await this.loadRegistry();
      this.synced = true;
      this.emit("snapshot");
    } catch (e) {
      this.lastError = (e as Error).message;
      this.ws?.terminate();
    }
  }

  private async loadRegistry(): Promise<HaRegistry> {
    try {
      const [entities, areas, devices] = await Promise.all([
        this.command<HaRegistry["entities"]>({ type: "config/entity_registry/list" }),
        this.command<HaRegistry["areas"]>({ type: "config/area_registry/list" }),
        this.command<HaRegistry["devices"]>({ type: "config/device_registry/list" }),
      ]);
      return {
        entities: entities.map((e) => ({ entity_id: e.entity_id, area_id: e.area_id, device_id: e.device_id, name: e.name, original_name: e.original_name, disabled_by: e.disabled_by, hidden_by: e.hidden_by })),
        areas: areas.map((a) => ({ area_id: a.area_id, name: a.name })),
        devices: devices.map((d) => ({ id: d.id, name: d.name, name_by_user: d.name_by_user, area_id: d.area_id, manufacturer: d.manufacturer, model: d.model })),
        available: true,
      };
    } catch {
      // Ohne Admin-Rechte sind die Registries nicht abrufbar – Vorschläge nutzen dann nur Namen.
      return { entities: [], areas: [], devices: [], available: false };
    }
  }
}

const g = globalThis as unknown as { __lumaHa?: HaConnection };
export const ha = (g.__lumaHa ??= new HaConnection());
