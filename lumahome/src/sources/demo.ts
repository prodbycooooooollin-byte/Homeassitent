// Demo-Datenquelle: simuliert eine Home-Assistant-Instanz vollständig im
// Browser. Befehle werden mit Verzögerung „bestätigt“, damit der Unterschied
// zwischen gesendetem Befehl und bestätigtem Zustand sichtbar bleibt.
import type { HaContext, HaRegistry, HaState } from "@/devices/ha-types";
import { isAllowedService } from "@/devices/ha-types";
import { LIGHT_WATTS, POWER_SOURCES, demoHistory, demoStatistics, flows, initialStates, statisticMeta } from "@/demo/sim";
import type { DeviceSource, ServiceCall, SourceListener } from "./types";

const REGISTRY: HaRegistry = {
  available: true,
  areas: [
    { area_id: "wohnen", name: "Wohnen & Essen" },
    { area_id: "kueche", name: "Küche" },
    { area_id: "buero", name: "Arbeitszimmer" },
    { area_id: "bad", name: "Bad" },
    { area_id: "schlafen", name: "Schlafzimmer" },
    { area_id: "gast", name: "Gästezimmer" },
  ],
  devices: [],
  entities: [
    { entity_id: "light.terrasse", area_id: "wohnen", device_id: null, name: null },
    { entity_id: "sensor.gaeste_temperatur", area_id: "gast", device_id: null, name: null },
  ],
};

let ctxCounter = 0;
const newContext = (): HaContext => ({ id: `demo-ctx-${Date.now().toString(36)}-${++ctxCounter}`, parent_id: null, user_id: null });

export class DemoSource implements DeviceSource {
  readonly mode = "demo" as const;
  private states = new Map<string, HaState>();
  private listener: SourceListener | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private paused = false;
  /** Für Tests: Verzögerung bis zur Bestätigung */
  confirmDelay = 450;

  start(listener: SourceListener) {
    this.listener = listener;
    for (const s of initialStates()) this.states.set(s.entity_id, s);
    listener.onStatus({ kind: "demo" });
    listener.onSnapshot([...this.states.values()], REGISTRY);
    this.timers.push(setInterval(() => this.tickPower(), 5000));
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.listener = null;
  }

  private emit(s: HaState) {
    this.states.set(s.entity_id, s);
    if (!this.paused) this.listener?.onState(s.entity_id, s);
  }

  private lightsOnWatts(): number {
    let w = 0;
    for (const s of this.states.values()) {
      if (s.entity_id.startsWith("light.") && s.state === "on") {
        const b = typeof s.attributes.brightness === "number" ? s.attributes.brightness / 255 : 1;
        w += LIGHT_WATTS * (0.25 + 0.75 * b);
      }
    }
    return w;
  }

  private tickPower() {
    if (this.paused) return;
    const now = Date.now();
    const extra = this.lightsOnWatts();
    const f = flows(now, extra);
    const iso = new Date(now).toISOString();
    for (const id of Object.keys(POWER_SOURCES)) {
      const prev = this.states.get(id);
      if (!prev) continue;
      let v = POWER_SOURCES[id](now);
      if (id === "sensor.hausverbrauch_leistung") v = f.house;
      if (id === "sensor.netz_leistung") v = f.grid;
      if (id === "sensor.batterie_leistung") v = f.battery;
      if (id === "sensor.tv_steckdose_leistung" && this.states.get("switch.tv_steckdose")?.state === "off") v = 0;
      if (id === "sensor.buero_steckdosenleiste_leistung" && this.states.get("switch.buero_steckdosenleiste")?.state === "off") v = 0;
      if (id === "sensor.waschmaschine_leistung" && this.states.get("switch.waschmaschine")?.state === "off") v = 0;
      this.emit({ ...prev, state: v.toFixed(1), last_updated: iso, last_reported: iso, last_changed: iso });
    }
  }

  /** Simuliert eine Änderung außerhalb von LumaHome (z. B. Wandschalter). */
  simulateExternalChange(): string {
    const lights = [...this.states.values()].filter((s) => s.entity_id.startsWith("light.") && s.state !== "unavailable");
    const s = lights[Math.floor(Math.random() * lights.length)];
    const on = s.state !== "on";
    const iso = new Date().toISOString();
    const attrs = { ...s.attributes };
    const modes = (attrs.supported_color_modes as string[]) ?? [];
    if (on && modes.some((m) => m !== "onoff")) attrs.brightness = 200;
    if (!on) {
      delete attrs.brightness;
      delete attrs.color_temp_kelvin;
    }
    this.emit({ ...s, state: on ? "on" : "off", attributes: attrs, last_changed: iso, last_updated: iso, context: { id: "extern", parent_id: null, user_id: null } });
    return String(s.attributes.friendly_name ?? s.entity_id);
  }

  /** Simuliert einen Verbindungsabbruch mit anschließender Neusynchronisierung. */
  simulateDisconnect(ms = 6000) {
    this.paused = true;
    this.listener?.onStatus({ kind: "reconnecting", reason: "Simulierter Verbindungsabbruch (Demo)", attempt: 1, since: Date.now() });
    setTimeout(() => {
      this.paused = false;
      this.listener?.onStatus({ kind: "demo" });
      this.listener?.onSnapshot([...this.states.values()], REGISTRY);
    }, ms);
  }

  async callService(call: ServiceCall): Promise<{ contextId: string | null }> {
    if (this.paused) throw new Error("Keine Verbindung (Demo-Verbindungsabbruch)");
    if (!isAllowedService(call.domain, call.service)) throw new Error("Dienst nicht freigegeben");
    const s = this.states.get(call.entityId);
    if (!s) throw new Error("Entität nicht gefunden");
    if (s.state === "unavailable") throw new Error("Gerät nicht erreichbar");
    const ctx = newContext();
    const next = applyService(s, call);
    setTimeout(() => {
      const iso = new Date().toISOString();
      this.emit({ ...next, context: ctx, last_updated: iso, last_reported: iso, last_changed: next.state !== s.state ? iso : s.last_changed });
      if (call.domain === "cover" && call.service !== "stop_cover") this.animateCover(call.entityId);
    }, this.confirmDelay);
    await new Promise((r) => setTimeout(r, 120));
    return { contextId: ctx.id };
  }

  private animateCover(id: string) {
    const step = () => {
      const s = this.states.get(id);
      if (!s || (s.state !== "opening" && s.state !== "closing")) return;
      const target = Number(s.attributes._target ?? (s.state === "opening" ? 100 : 0));
      const pos = typeof s.attributes.current_position === "number" ? s.attributes.current_position : s.state === "opening" ? 0 : 100;
      const dir = s.state === "opening" ? 1 : -1;
      const np = Math.max(0, Math.min(100, pos + dir * 20));
      const done = dir > 0 ? np >= target : np <= target;
      const attrs: Record<string, unknown> = { ...s.attributes };
      if (typeof s.attributes.current_position === "number") attrs.current_position = done ? target : np;
      if (done) delete attrs._target;
      const iso = new Date().toISOString();
      this.emit({ ...s, attributes: attrs, state: done ? (target > 0 ? "open" : "closed") : s.state, last_updated: iso, last_changed: iso });
      if (!done) setTimeout(step, 700);
    };
    setTimeout(step, 700);
  }

  async listStatisticIds() {
    return statisticMeta();
  }

  async statistics(ids: string[], start: number, end: number, period: "5minute" | "hour" | "day") {
    await new Promise((r) => setTimeout(r, 150));
    return demoStatistics(ids, start, end, period, Date.now());
  }

  async history(ids: string[], start: number, end: number) {
    await new Promise((r) => setTimeout(r, 150));
    return demoHistory(ids, start, end, Date.now());
  }

  async energyPrefs() {
    return {
      energy_sources: [
        { type: "grid" as const, flow_from: [{ stat_energy_from: "sensor.netzbezug_energie" }], flow_to: [{ stat_energy_to: "sensor.einspeisung_energie" }] },
        { type: "solar" as const, stat_energy_from: "sensor.pv_energie" },
      ],
      device_consumption: [{ stat_consumption: "sensor.kuehlschrank_energie", included_in_stat: "sensor.kueche_stromkreis_energie" }],
    };
  }
}

function applyService(s: HaState, call: ServiceCall): HaState {
  const data = call.data ?? {};
  const a: Record<string, unknown> = { ...s.attributes };
  const modes = (a.supported_color_modes as string[] | undefined) ?? [];
  switch (`${call.domain}.${call.service}`) {
    case "light.turn_on": {
      if (modes.some((m) => m !== "onoff")) {
        if (typeof data.brightness_pct === "number") a.brightness = Math.round((data.brightness_pct / 100) * 255);
        else if (typeof a.brightness !== "number") a.brightness = 255;
      }
      if (typeof data.color_temp_kelvin === "number" && modes.includes("color_temp")) {
        a.color_temp_kelvin = data.color_temp_kelvin;
        a.color_mode = "color_temp";
        delete a.rgb_color;
      } else if (modes.includes("color_temp") && typeof a.color_temp_kelvin !== "number" && !a.rgb_color) a.color_temp_kelvin = 2900;
      if (Array.isArray(data.rgb_color)) {
        a.rgb_color = data.rgb_color;
        a.color_mode = "rgb";
      }
      return { ...s, state: "on", attributes: a };
    }
    case "light.turn_off":
    case "switch.turn_off":
      delete a.brightness;
      return { ...s, state: "off", attributes: a };
    case "switch.turn_on":
      return { ...s, state: "on", attributes: a };
    case "light.toggle":
    case "switch.toggle":
      return applyService(s, { ...call, service: s.state === "on" ? "turn_off" : "turn_on" });
    case "cover.open_cover":
      a._target = 100;
      return { ...s, state: typeof a.current_position === "number" ? "opening" : "open", attributes: a };
    case "cover.close_cover":
      a._target = 0;
      return { ...s, state: typeof a.current_position === "number" ? "closing" : "closed", attributes: a };
    case "cover.stop_cover":
      delete a._target;
      return { ...s, state: typeof a.current_position === "number" && a.current_position > 0 ? "open" : s.state, attributes: a };
    case "cover.set_cover_position": {
      const target = Number(data.position ?? 0);
      const pos = Number(a.current_position ?? 0);
      a._target = target;
      return { ...s, state: target > pos ? "opening" : target < pos ? "closing" : s.state, attributes: a };
    }
    case "climate.set_hvac_mode":
      a.hvac_action = data.hvac_mode === "off" ? "off" : "idle";
      return { ...s, state: String(data.hvac_mode), attributes: a };
    case "climate.set_temperature":
      a.temperature = data.temperature;
      if (typeof a.current_temperature === "number") a.hvac_action = Number(data.temperature) > a.current_temperature ? "heating" : "idle";
      return { ...s, attributes: a };
    case "climate.turn_off":
      return { ...s, state: "off", attributes: { ...a, hvac_action: "off" } };
    case "climate.turn_on":
      return { ...s, state: "heat", attributes: { ...a, hvac_action: "idle" } };
  }
  return s;
}
