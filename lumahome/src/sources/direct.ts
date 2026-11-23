// Live-Datenquelle ohne eigenen Server: der Browser spricht direkt mit Home
// Assistant. Es gelten die Rechte des HA-Benutzers, dem der Token gehört.
// LumaHome ruft trotzdem nur die freigegebenen Steuerdienste auf.
import type { HaEnergyPrefs, HaHistory, HaStatisticMeta, HaStatistics } from "@/devices/ha-types";
import { isAllowedService } from "@/devices/ha-types";
import { HaSocket } from "./haSocket";
import type { DeviceSource, ServiceCall, SourceListener } from "./types";

const ALLOWED_DATA = new Set(["brightness_pct", "color_temp_kelvin", "hs_color", "rgb_color", "transition", "position", "hvac_mode", "temperature"]);

export class DirectSource implements DeviceSource {
  readonly mode = "live" as const;
  socket: HaSocket | null = null;

  constructor(readonly url: string, readonly token: string) {}

  start(listener: SourceListener) {
    this.socket = new HaSocket(this.url, this.token, listener);
    this.socket.start();
  }

  stop() {
    this.socket?.stop();
    this.socket = null;
  }

  private cmd<T>(msg: Record<string, unknown>, timeout?: number) {
    if (!this.socket) return Promise.reject(new Error("Keine Verbindung"));
    return this.socket.command<T>(msg, timeout);
  }

  async callService(call: ServiceCall) {
    if (!isAllowedService(call.domain, call.service)) throw new Error(`Dienst ${call.domain}.${call.service} ist nicht freigegeben.`);
    if (call.entityId.split(".")[0] !== call.domain) throw new Error("Ungültige Entität.");
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(call.data ?? {})) if (ALLOWED_DATA.has(k)) data[k] = v;
    const r = await this.cmd<{ context?: { id: string } }>({ type: "call_service", domain: call.domain, service: call.service, service_data: data, target: { entity_id: call.entityId } });
    return { contextId: r?.context?.id ?? null };
  }

  listStatisticIds() {
    return this.cmd<HaStatisticMeta[]>({ type: "recorder/list_statistic_ids" });
  }

  statistics(ids: string[], start: number, end: number, period: string, types: string[]) {
    return this.cmd<HaStatistics>(
      { type: "recorder/statistics_during_period", start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), statistic_ids: ids, period, types },
      30_000,
    );
  }

  history(ids: string[], start: number, end: number) {
    return this.cmd<HaHistory>(
      {
        type: "history/history_during_period",
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
        entity_ids: ids,
        minimal_response: true,
        no_attributes: true,
        include_start_time_state: true,
        significant_changes_only: false,
      },
      30_000,
    );
  }

  async energyPrefs() {
    try {
      return await this.cmd<HaEnergyPrefs>({ type: "energy/get_prefs" });
    } catch {
      return null;
    }
  }

  /** Benutzerdaten in Home Assistant (frontend/get_user_data). */
  getUserData<T>(key: string) {
    return this.cmd<{ value: T | null }>({ type: "frontend/get_user_data", key }).then((r) => r?.value ?? null);
  }

  setUserData(key: string, value: unknown) {
    return this.cmd<null>({ type: "frontend/set_user_data", key, value }, 30_000);
  }
}
