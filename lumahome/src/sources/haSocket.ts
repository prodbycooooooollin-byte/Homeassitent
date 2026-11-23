// Verbindung des Browsers direkt zur Home-Assistant-WebSocket-API
// (https://developers.home-assistant.io/docs/api/websocket).
// Wird genutzt, wenn LumaHome als Webseite ohne eigenen Server läuft.
import type { HaRegistry, HaState } from "@/devices/ha-types";
import type { ConnectionStatus } from "./types";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface HaSocketListener {
  onStatus(s: ConnectionStatus): void;
  onSnapshot(states: HaState[], registry: HaRegistry): void;
  onState(entityId: string, state: HaState | null): void;
}

export class HaAuthError extends Error {}

/** Normalisiert eine eingegebene Adresse zu https://host[:port] (ohne Pfad). */
export function normalizeHaUrl(input: string): string {
  let s = input.trim();
  if (!s) throw new Error("Bitte die Adresse deiner Home-Assistant-Instanz eingeben.");
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error("Die Adresse ist ungültig.");
  }
  return `${u.protocol}//${u.host}`;
}

export function wsUrl(haUrl: string): string {
  return haUrl.replace(/^http/i, "ws") + "/api/websocket";
}

/** Hinweis, wenn der Browser eine unverschlüsselte Verbindung von einer https-Seite blockieren wird. */
export function mixedContentProblem(haUrl: string): string | null {
  if (typeof location === "undefined") return null;
  if (location.protocol === "https:" && haUrl.startsWith("http://")) {
    return "Diese Seite läuft über https. Browser blockieren dann Verbindungen zu einer Home-Assistant-Adresse mit http://. Nutze die https-Adresse deiner Instanz (z. B. Home Assistant Cloud „…ui.nabu.casa“ oder eine eigene Domain mit Zertifikat).";
  }
  return null;
}

export class HaSocket {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private lastPong = Date.now();
  private stopped = false;
  private connected = false;
  private states = new Map<string, HaState>();
  private lastError: string | null = null;
  haVersion: string | null = null;
  user: { name: string; is_admin: boolean } | null = null;

  constructor(private url: string, private token: string, private listener: HaSocketListener) {}

  /** Einmalige Prüfung von Adresse und Token (für die Anmeldung). */
  static async test(url: string, token: string, timeoutMs = 10_000): Promise<{ haVersion: string | null }> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl(url));
      } catch (e) {
        reject(new Error(`Verbindung nicht möglich: ${(e as Error).message}`));
        return;
      }
      const t = setTimeout(() => {
        ws.close();
        reject(new Error("Keine Antwort von Home Assistant. Stimmt die Adresse und ist die Instanz von diesem Gerät aus erreichbar?"));
      }, timeoutMs);
      ws.onmessage = (m) => {
        const msg = JSON.parse(String(m.data));
        if (msg.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: token }));
        else if (msg.type === "auth_ok") {
          clearTimeout(t);
          ws.close();
          resolve({ haVersion: msg.ha_version ?? null });
        } else if (msg.type === "auth_invalid") {
          clearTimeout(t);
          ws.close();
          reject(new HaAuthError("Der Zugriffstoken wurde abgelehnt. Bitte einen neuen langlebigen Token erstellen und vollständig einfügen."));
        }
      };
      ws.onerror = () => {
        clearTimeout(t);
        reject(new Error("Verbindung zu Home Assistant fehlgeschlagen. Prüfe Adresse, Erreichbarkeit und ob die Adresse mit https beginnt."));
      };
    });
  }

  start() {
    this.stopped = false;
    this.listener.onStatus({ kind: "connecting" });
    this.open();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.ping) clearInterval(this.ping);
    this.ws?.close();
  }

  /** Für Tests: Verbindung hart trennen. */
  drop() {
    this.ws?.close();
  }

  private open() {
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl(this.url));
    } catch (e) {
      this.lastError = (e as Error).message;
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onmessage = (m) => this.onMessage(ws, String(m.data));
    ws.onerror = () => {
      this.lastError = "Verbindungsfehler";
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.onClosed();
    };
  }

  private onClosed() {
    this.connected = false;
    if (this.ping) clearInterval(this.ping);
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Verbindung zu Home Assistant getrennt"));
    }
    this.pending.clear();
    if (this.stopped) return;
    this.scheduleReconnect();
  }

  private authFailed = false;

  private scheduleReconnect() {
    if (this.authFailed) {
      this.timer = setTimeout(() => this.open(), 60_000);
      return;
    }
    this.attempt++;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.attempt - 1, 5));
    this.listener.onStatus({ kind: "reconnecting", reason: this.lastError ?? "Verbindung beendet", attempt: this.attempt, since: Date.now() });
    this.timer = setTimeout(() => this.open(), delay);
  }

  command<T = unknown>(msg: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.connected) return Promise.reject(new Error("Keine Verbindung zu Home Assistant"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Zeitüberschreitung bei Home Assistant"));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      ws.send(JSON.stringify({ ...msg, id }));
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
        ws.send(JSON.stringify({ type: "auth", access_token: this.token }));
        return;
      case "auth_invalid":
        this.authFailed = true;
        this.listener.onStatus({ kind: "auth_failed", reason: String(msg.message ?? "Zugriffstoken ungültig") });
        ws.close();
        return;
      case "auth_ok":
        this.authFailed = false;
        this.connected = true;
        this.attempt = 0;
        this.lastError = null;
        this.haVersion = typeof msg.ha_version === "string" ? msg.ha_version : null;
        this.listener.onStatus({ kind: "connected", haVersion: this.haVersion, since: Date.now() });
        this.startPing(ws);
        void this.sync();
        return;
      case "pong":
        this.lastPong = Date.now();
        this.resolve(msg);
        return;
      case "result":
        this.resolve(msg);
        return;
      case "event": {
        const ev = msg.event as { event_type?: string; data?: { entity_id: string; new_state: HaState | null } };
        if (ev?.event_type !== "state_changed" || !ev.data) return;
        const { entity_id, new_state } = ev.data;
        if (new_state) this.states.set(entity_id, new_state);
        else this.states.delete(entity_id);
        this.listener.onState(entity_id, new_state);
        return;
      }
    }
  }

  private resolve(msg: Record<string, unknown>) {
    const p = this.pending.get(Number(msg.id));
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(Number(msg.id));
    if (msg.type === "pong" || msg.success) p.resolve(msg.result);
    else p.reject(new Error((msg.error as { message?: string } | undefined)?.message ?? "Home Assistant meldet einen Fehler"));
  }

  private startPing(ws: WebSocket) {
    if (this.ping) clearInterval(this.ping);
    this.lastPong = Date.now();
    this.ping = setInterval(() => {
      if (Date.now() - this.lastPong > 45_000) {
        this.lastError = "Keine Antwort von Home Assistant";
        ws.close();
        return;
      }
      this.command({ type: "ping" }, 10_000).catch(() => undefined);
    }, 20_000);
  }

  private async sync() {
    try {
      await this.command({ type: "subscribe_events", event_type: "state_changed" });
      const list = await this.command<HaState[]>({ type: "get_states" }, 30_000);
      const fresh = new Map<string, HaState>();
      for (const s of list) {
        const known = this.states.get(s.entity_id);
        fresh.set(s.entity_id, known && known.last_updated > s.last_updated ? known : s);
      }
      this.states = fresh;
      this.user = await this.command<{ name: string; is_admin: boolean }>({ type: "auth/current_user" }).catch(() => null);
      const registry = await this.loadRegistry();
      this.listener.onSnapshot([...this.states.values()], registry);
    } catch (e) {
      this.lastError = (e as Error).message;
      this.ws?.close();
    }
  }

  private async loadRegistry(): Promise<HaRegistry> {
    try {
      const [entities, areas, devices] = await Promise.all([
        this.command<HaRegistry["entities"]>({ type: "config/entity_registry/list" }),
        this.command<HaRegistry["areas"]>({ type: "config/area_registry/list" }),
        this.command<HaRegistry["devices"]>({ type: "config/device_registry/list" }),
      ]);
      return { entities, areas, devices, available: true };
    } catch {
      return { entities: [], areas: [], devices: [], available: false };
    }
  }
}
