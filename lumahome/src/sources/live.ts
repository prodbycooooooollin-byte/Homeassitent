// Live-Datenquelle: spricht ausschließlich mit dem lokalen LumaHome-Server.
// Der Server hält die Verbindung zu Home Assistant und den Zugriffstoken.
import type { HaEnergyPrefs, HaHistory, HaStatisticMeta, HaStatistics } from "@/devices/ha-types";
import type { DeviceSource, ServiceCall, SourceListener, StreamEvent } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-LumaHome": "1", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

export class LiveSource implements DeviceSource {
  readonly mode = "live" as const;
  private es: EventSource | null = null;
  private listener: SourceListener | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  start(listener: SourceListener) {
    this.listener = listener;
    listener.onStatus({ kind: "connecting" });
    this.open();
  }

  private open() {
    const es = new EventSource("/api/ha/stream");
    this.es = es;
    es.onmessage = (m) => {
      let ev: StreamEvent;
      try {
        ev = JSON.parse(m.data);
      } catch {
        return;
      }
      if (ev.type === "status") this.listener?.onStatus(ev.status);
      else if (ev.type === "snapshot") this.listener?.onSnapshot(ev.states, ev.registry);
      else if (ev.type === "state") this.listener?.onState(ev.entity_id, ev.new_state);
    };
    es.onerror = async () => {
      // EventSource verbindet selbst neu; bei Berechtigungsfehlern muss geprüft werden.
      if (es.readyState === EventSource.CLOSED) {
        try {
          const s = await api<{ role: string }>("/api/session");
          if (s.role === "none") {
            this.listener?.onStatus({ kind: "forbidden" });
            return;
          }
        } catch {
          /* Server nicht erreichbar */
        }
        this.listener?.onStatus({ kind: "server_unreachable", reason: "LumaHome-Server nicht erreichbar" });
        this.retryTimer = setTimeout(() => {
          if (this.listener) this.open();
        }, 4000);
      } else {
        this.listener?.onStatus({ kind: "server_unreachable", reason: "Verbindung zum LumaHome-Server unterbrochen" });
      }
    };
  }

  stop() {
    this.es?.close();
    this.es = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.listener = null;
  }

  async callService(call: ServiceCall) {
    return api<{ contextId: string | null }>("/api/ha/service", {
      method: "POST",
      body: JSON.stringify({ domain: call.domain, service: call.service, entity_id: call.entityId, data: call.data ?? {} }),
    });
  }

  async listStatisticIds() {
    return api<HaStatisticMeta[]>("/api/ha/statistic-ids");
  }

  async statistics(ids: string[], start: number, end: number, period: string, types: string[]) {
    return api<HaStatistics>("/api/ha/statistics", { method: "POST", body: JSON.stringify({ ids, start, end, period, types }) });
  }

  async history(ids: string[], start: number, end: number) {
    return api<HaHistory>("/api/ha/history", { method: "POST", body: JSON.stringify({ ids, start, end }) });
  }

  async energyPrefs() {
    return api<HaEnergyPrefs | null>("/api/ha/energy-prefs");
  }
}
