// Simulierte Home-Assistant-Daten für den Demo-Modus. Alle Werte sind
// deterministisch erzeugte Beispieldaten und werden in der Oberfläche stets
// als Demo gekennzeichnet.
import type { HaHistory, HaState, HaStatisticMeta, HaStatisticRow } from "@/devices/ha-types";

const HOUR = 3.6e6;

/** Deterministisches Rauschen 0..1 */
export function noise(key: string, n: number): number {
  let h = 2166136261 ^ n;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}

const hourOf = (t: number) => new Date(t).getHours() + new Date(t).getMinutes() / 60;
const dayIndex = (t: number) => Math.floor(t / (24 * HOUR));

/** Leistungsprofile in W je Verbraucher. */
export const PROFILES: Record<string, (t: number) => number> = {
  fridge: (t) => {
    const cycle = (t / 60000) % 50; // 50-Minuten-Kühlzyklus
    return cycle < 18 ? 85 + noise("fr", Math.floor(t / 300000)) * 10 : 2;
  },
  stove: (t) => {
    const h = hourOf(t);
    const d = dayIndex(t);
    const lunch = h >= 12 && h < 12.75 && noise("st", d) > 0.35;
    const dinner = h >= 18.25 && h < 19.25 && noise("st2", d) > 0.15;
    return lunch || dinner ? 1400 + noise("stv", Math.floor(t / 600000)) * 900 : 0;
  },
  kitchenRest: (t) => {
    const h = hourOf(t);
    return 25 + (h > 6.5 && h < 8 ? 900 * noise("kr", Math.floor(t / 900000)) : 0) + (h > 7 && h < 22 ? 30 : 0);
  },
  tv: (t) => {
    const h = hourOf(t);
    return h >= 19 && h < 22.5 ? 95 + noise("tv", Math.floor(t / 600000)) * 15 : 0.5;
  },
  washer: (t) => {
    const d = dayIndex(t);
    const h = hourOf(t);
    if (d % 3 !== 0 || h < 9 || h > 11) return 0.8;
    const m = (h - 9) * 60;
    return m < 20 ? 2000 : m < 100 ? 120 + noise("wa", Math.floor(t / 120000)) * 80 : m < 115 ? 450 : 0.8;
  },
  office: (t) => {
    const h = hourOf(t);
    const wd = new Date(t).getDay();
    return wd > 0 && wd < 6 && h >= 8 && h < 17 ? 110 + noise("of", Math.floor(t / 300000)) * 60 : 6;
  },
  heatpump: (t) => {
    const h = hourOf(t);
    return 350 + (h < 7 || h > 20 ? 450 : 150) * noise("hp", Math.floor(t / 1800000));
  },
  base: (t) => 140 + noise("ba", Math.floor(t / 600000)) * 40 + (hourOf(t) > 18 && hourOf(t) < 23 ? 120 : 0),
};

export function kitchenCircuit(t: number) {
  return PROFILES.fridge(t) + PROFILES.stove(t) + PROFILES.kitchenRest(t);
}

export function houseLoad(t: number, extra = 0) {
  return (
    kitchenCircuit(t) + PROFILES.tv(t) + PROFILES.washer(t) + PROFILES.office(t) + PROFILES.heatpump(t) + PROFILES.base(t) + extra
  );
}

export function pvPower(t: number) {
  const h = hourOf(t);
  if (h < 6.8 || h > 19) return 0;
  const x = (h - 12.9) / 3.4;
  const clouds = 0.45 + 0.55 * noise("cl", dayIndex(t)) * (0.85 + 0.15 * noise("cl2", Math.floor(t / 900000)));
  return Math.max(0, 5200 * Math.exp(-x * x) * clouds);
}

/** Batteriesaldo: positiv = Entladen ins Haus, negativ = Laden. */
export function batteryPower(t: number, load: number, pv: number) {
  const surplus = pv - load;
  const h = hourOf(t);
  if (surplus > 150 && h < 16) return -Math.min(2500, surplus * 0.85);
  if (h >= 18 || h < 1) return Math.min(1500, load * 0.8);
  return 0;
}

export interface EnergySplit {
  house: number;
  pv: number;
  battery: number;
  grid: number;
}

export function flows(t: number, extra = 0): EnergySplit {
  const house = houseLoad(t, extra);
  const pv = pvPower(t);
  const battery = batteryPower(t, house, pv);
  return { house, pv, battery, grid: house - pv - battery };
}

/** Entitäten mit Leistungsprofil (W) und abgeleitetem Energiezähler. */
export const POWER_SOURCES: Record<string, (t: number) => number> = {
  "sensor.hausverbrauch_leistung": (t) => flows(t).house,
  "sensor.netz_leistung": (t) => flows(t).grid,
  "sensor.pv_leistung": (t) => flows(t).pv,
  "sensor.batterie_leistung": (t) => flows(t).battery,
  "sensor.kueche_stromkreis_leistung": kitchenCircuit,
  "sensor.kuehlschrank_leistung": PROFILES.fridge,
  "sensor.herd_leistung": PROFILES.stove,
  "sensor.tv_steckdose_leistung": PROFILES.tv,
  "sensor.waschmaschine_leistung": PROFILES.washer,
  "sensor.buero_steckdosenleiste_leistung": PROFILES.office,
  "sensor.waermepumpe_leistung": PROFILES.heatpump,
};

export const ENERGY_SOURCES: Record<string, (t: number) => number> = {
  "sensor.hausverbrauch_energie": (t) => flows(t).house,
  "sensor.netzbezug_energie": (t) => Math.max(0, flows(t).grid),
  "sensor.einspeisung_energie": (t) => Math.max(0, -flows(t).grid),
  "sensor.pv_energie": pvPower,
  "sensor.kueche_stromkreis_energie": kitchenCircuit,
  "sensor.kuehlschrank_energie": PROFILES.fridge,
  "sensor.tv_steckdose_energie": PROFILES.tv,
  "sensor.waschmaschine_energie": PROFILES.washer,
  "sensor.buero_steckdosenleiste_energie": PROFILES.office,
  "sensor.waermepumpe_energie": PROFILES.heatpump,
};

/** Diese Entitäten haben in der Demo bewusst keine Langzeitstatistik (Verlauf wird genutzt). */
export const NO_STATISTICS = new Set(["sensor.buero_steckdosenleiste_energie", "sensor.buero_steckdosenleiste_leistung"]);

/** Bewusst eingebaute Datenlücke: Waschmaschine gestern 02:00–06:00. */
export function inDemoGap(entityId: string, t: number, now: number): boolean {
  if (!entityId.startsWith("sensor.waschmaschine")) return false;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  y.setHours(2, 0, 0, 0);
  return t >= y.getTime() && t < y.getTime() + 4 * HOUR;
}

/** Integration einer Leistungsfunktion (W) über [a, b) in kWh, Schrittweite 5 min. */
export function integrateKwh(f: (t: number) => number, a: number, b: number): number {
  const step = 5 * 60000;
  let s = 0;
  for (let t = a; t < b; t += step) s += (f(t + step / 2) * Math.min(step, b - t)) / 3.6e6 / 1000;
  return s;
}

function meanW(f: (t: number) => number, a: number, b: number): number {
  return (integrateKwh(f, a, b) * 1000 * 3.6e6) / (b - a);
}

export function statisticMeta(): HaStatisticMeta[] {
  const out: HaStatisticMeta[] = [];
  for (const id of Object.keys(POWER_SOURCES)) {
    if (!NO_STATISTICS.has(id)) out.push({ statistic_id: id, has_mean: true, has_sum: false, statistics_unit_of_measurement: "W", source: "recorder" });
  }
  for (const id of Object.keys(ENERGY_SOURCES)) {
    if (!NO_STATISTICS.has(id)) out.push({ statistic_id: id, has_mean: false, has_sum: true, statistics_unit_of_measurement: "kWh", source: "recorder" });
  }
  return out;
}

/** Statistikzeilen nach Art von recorder/statistics_during_period (nur abgeschlossene Perioden). */
export function demoStatistics(ids: string[], start: number, end: number, period: "5minute" | "hour" | "day", now: number) {
  const out: Record<string, HaStatisticRow[]> = {};
  for (const id of ids) {
    if (NO_STATISTICS.has(id)) continue;
    const pf = POWER_SOURCES[id];
    const ef = ENERGY_SOURCES[id];
    if (!pf && !ef) continue;
    const rows: HaStatisticRow[] = [];
    const cur = new Date(start);
    if (period === "day") cur.setHours(0, 0, 0, 0);
    else if (period === "hour") cur.setMinutes(0, 0, 0);
    while (cur.getTime() < end) {
      const s = cur.getTime();
      if (period === "day") cur.setDate(cur.getDate() + 1);
      else if (period === "hour") cur.setHours(cur.getHours() + 1);
      else cur.setMinutes(cur.getMinutes() + 5);
      let e = cur.getTime();
      // Stündliche Statistiken existieren nur für abgeschlossene Perioden; Tage aus abgeschlossenen Stunden
      if (period !== "day" && e > now) break;
      if (period === "day") e = Math.min(e, Math.floor(now / HOUR) * HOUR);
      if (e <= s) break;
      // Lücke: betroffene Stunden fehlen; Tageswerte enthalten nur vorhandene Stunden
      if (period !== "day" && inDemoGap(id, s, now)) continue;
      const fn = pf ?? ef;
      if (pf) rows.push({ start: s, end: e, mean: meanW(pf, s, e) });
      else {
        let kwh = integrateKwh(fn, s, e);
        if (period === "day") {
          for (let h = s; h < e; h += HOUR) if (inDemoGap(id, h, now)) kwh -= integrateKwh(fn, h, h + HOUR);
        }
        rows.push({ start: s, end: e, change: kwh });
      }
    }
    out[id] = rows;
  }
  return out;
}

/**
 * Rohverlauf (history/history_during_period, minimal). Für den Büro-Zähler:
 * Zählerstand alle 15 min, Zählerwechsel vor drei Tagen um 10:00 und eine
 * Nichtverfügbarkeit gestern 13:00–15:00.
 */
export function demoHistory(ids: string[], start: number, end: number, now: number): HaHistory {
  const out: HaHistory = {};
  const stop = Math.min(end, now);
  const swap = new Date(now);
  swap.setDate(swap.getDate() - 3);
  swap.setHours(10, 0, 0, 0);
  const outage = new Date(now);
  outage.setDate(outage.getDate() - 1);
  outage.setHours(13, 0, 0, 0);
  for (const id of ids) {
    const pts: { s: string; lu: number }[] = [];
    if (id === "sensor.buero_steckdosenleiste_energie") {
      const step = 15 * 60000;
      const origin = start - (start % step);
      let counter = 412.6 + integrateKwh(PROFILES.office, origin - 40 * 24 * HOUR, origin);
      if (origin >= swap.getTime()) counter = integrateKwh(PROFILES.office, swap.getTime(), origin);
      for (let t = origin; t <= stop; t += step) {
        if (t > origin) counter += integrateKwh(PROFILES.office, t - step, t);
        if (t === swap.getTime()) counter = 0; // neuer Zähler beginnt bei 0
        const unavailable = t >= outage.getTime() && t < outage.getTime() + 2 * HOUR;
        pts.push({ s: unavailable ? "unavailable" : counter.toFixed(3), lu: t / 1000 });
      }
    } else if (POWER_SOURCES[id]) {
      const step = 5 * 60000;
      const origin = start - (start % step);
      for (let t = origin; t <= stop; t += step) pts.push({ s: POWER_SOURCES[id](t).toFixed(1), lu: t / 1000 });
    }
    out[id] = pts;
  }
  return out;
}

function at(t: number) {
  return new Date(t).toISOString();
}

const light = (id: string, name: string, on: boolean, modes: string[], brightness = 180, kelvin = 2900, extra: Record<string, unknown> = {}): HaState => ({
  entity_id: id,
  state: on ? "on" : "off",
  attributes: {
    friendly_name: name,
    supported_color_modes: modes,
    min_color_temp_kelvin: 2200,
    max_color_temp_kelvin: 6500,
    ...(on && modes.some((m) => m !== "onoff") ? { brightness } : {}),
    ...(on && modes.includes("color_temp") ? { color_temp_kelvin: kelvin, color_mode: "color_temp" } : {}),
    ...extra,
  },
  last_changed: at(Date.now() - 3600_000),
  last_updated: at(Date.now() - 3600_000),
  last_reported: at(Date.now() - 3600_000),
});

const sensor = (id: string, name: string, value: string, unit: string | null, deviceClass: string | null, stateClass: string | null = "measurement"): HaState => ({
  entity_id: id,
  state: value,
  attributes: {
    friendly_name: name,
    ...(unit ? { unit_of_measurement: unit } : {}),
    ...(deviceClass ? { device_class: deviceClass } : {}),
    ...(stateClass ? { state_class: stateClass } : {}),
  },
  last_changed: at(Date.now() - 600_000),
  last_updated: at(Date.now() - 60_000),
  last_reported: at(Date.now() - 60_000),
});

export function initialStates(now = Date.now()): HaState[] {
  const h = new Date(now).getHours();
  const evening = h >= 17 || h < 1;
  const states: HaState[] = [
    light("light.wohnen_decke", "Wohnen Decke", false, ["color_temp"]),
    light("light.stehleuchte_sofa", "Stehleuchte Sofa", evening, ["color_temp", "hs"], 150, 2700),
    light("light.esstisch_pendel", "Esstisch Pendel", evening, ["brightness"], 200),
    light("light.kueche_decke", "Küche Decke", false, ["onoff"]),
    light("light.kueche_led", "Küche LED-Leiste", true, ["hs", "color_temp"], 110, 3000),
    light("light.flur_spots", "Flur Spots", false, ["brightness"]),
    light("light.buero_decke", "Büro Decke", !evening, ["color_temp"], 230, 4200),
    light("light.bad_decke", "Bad Decke", false, ["onoff"]),
    light("light.hwr_decke", "HWR Decke", false, ["onoff"]),
    light("light.schlafzimmer_decke", "Schlafzimmer Decke", false, ["color_temp"]),
    light("light.nachttisch_links", "Nachttisch links", false, ["brightness"]),
    light("light.nachttisch_rechts", "Nachttisch rechts", false, ["brightness"]),
    light("light.kinderzimmer_decke", "Kinderzimmer Decke", false, ["color_temp", "hs"]),
    light("light.galerie", "Galerie", false, ["brightness"]),
    light("light.terrasse", "Terrasse außen", false, ["onoff"]),
    {
      entity_id: "switch.tv_steckdose",
      state: "on",
      attributes: { friendly_name: "TV-Steckdose", device_class: "outlet" },
      last_changed: at(now - 7200_000),
      last_updated: at(now - 7200_000),
    },
    {
      entity_id: "switch.buero_steckdosenleiste",
      state: "on",
      attributes: { friendly_name: "Steckdosenleiste Büro", device_class: "outlet" },
      last_changed: at(now - 7200_000),
      last_updated: at(now - 7200_000),
    },
    {
      entity_id: "switch.waschmaschine",
      state: "on",
      attributes: { friendly_name: "Waschmaschine Zwischenstecker", device_class: "outlet" },
      last_changed: at(now - 7200_000),
      last_updated: at(now - 7200_000),
    },
    {
      entity_id: "cover.wohnen_rollladen",
      state: "open",
      attributes: { friendly_name: "Rollladen Wohnen", current_position: 100, supported_features: 15, device_class: "shutter" },
      last_changed: at(now - 7200_000),
      last_updated: at(now - 7200_000),
    },
    {
      entity_id: "cover.schlafzimmer_rollladen",
      state: "closed",
      attributes: { friendly_name: "Rollladen Schlafzimmer", supported_features: 3, device_class: "shutter" },
      last_changed: at(now - 7200_000),
      last_updated: at(now - 7200_000),
    },
    { ...sensor("binary_sensor.wohnen_fenster", "Fenster Wohnen", "off", null, "window", null) },
    { ...sensor("binary_sensor.terrassentuer", "Terrassentür", "off", null, "door", null) },
    { ...sensor("binary_sensor.kueche_fenster", "Fenster Küche", "on", null, "window", null) },
    {
      entity_id: "sensor.bad_oben_fenstergriff",
      state: "tilted",
      attributes: { friendly_name: "Fenstergriff Bad oben", device_class: "enum", options: ["open", "closed", "tilted"] },
      last_changed: at(now - 1800_000),
      last_updated: at(now - 1800_000),
      last_reported: at(now - 60_000),
    },
    climate("climate.wohnen_heizung", "Heizung Wohnen", "heat", 21.4, 21.5, "idle"),
    climate("climate.bad_heizkoerper", "Badheizkörper", "heat", 22.1, 23, "heating"),
    climate("climate.schlafzimmer_heizung", "Heizung Schlafzimmer", "off", 18.6, 18, "off"),
    {
      entity_id: "climate.waermepumpe",
      state: "heat",
      attributes: { friendly_name: "Wärmepumpe", hvac_modes: ["off", "heat", "auto"], hvac_action: "heating", current_temperature: 34.5, supported_features: 384 },
      last_changed: at(now - 7200_000),
      last_updated: at(now - 300_000),
    },
    sensor("sensor.wohnen_temperatur", "Temperatur Wohnen", "21.4", "°C", "temperature"),
    sensor("sensor.wohnen_luftfeuchte", "Luftfeuchte Wohnen", "47", "%", "humidity"),
    sensor("sensor.buero_temperatur", "Temperatur Büro", "20.8", "°C", "temperature"),
    sensor("sensor.buero_co2", "CO₂ Büro", "1180", "ppm", "carbon_dioxide"),
    sensor("sensor.bad_luftfeuchte", "Luftfeuchte Bad", "71", "%", "humidity"),
    sensor("sensor.bad_temperatur", "Temperatur Bad", "22.1", "°C", "temperature"),
    sensor("sensor.schlafzimmer_temperatur", "Temperatur Schlafzimmer", "18.6", "°C", "temperature"),
    { ...sensor("sensor.kinderzimmer_temperatur", "Temperatur Kinderzimmer", "unavailable", "°C", "temperature") },
    { ...sensor("sensor.kueche_temperatur", "Temperatur Küche", "21.9", "°C", "temperature"), last_reported: at(now - 5 * 3600_000), last_updated: at(now - 5 * 3600_000) },
    sensor("sensor.gaeste_temperatur", "Temperatur Gästezimmer", "19.4", "°C", "temperature"),
  ];
  for (const id of Object.keys(POWER_SOURCES)) {
    const s = sensor(id, nameFor(id), POWER_SOURCES[id](now).toFixed(1), "W", "power");
    states.push(s);
  }
  for (const id of Object.keys(ENERGY_SOURCES)) {
    const noStats = NO_STATISTICS.has(id);
    states.push(sensor(id, nameFor(id), (1000 + integrateKwh(ENERGY_SOURCES[id], now - 24 * HOUR, now) * 30).toFixed(2), "kWh", noStats ? null : "energy", noStats ? null : "total_increasing"));
  }
  return states;
}

function climate(id: string, name: string, mode: string, current: number, target: number, action: string): HaState {
  return {
    entity_id: id,
    state: mode,
    attributes: {
      friendly_name: name,
      hvac_modes: ["off", "heat"],
      hvac_action: action,
      current_temperature: current,
      temperature: target,
      min_temp: 5,
      max_temp: 28,
      target_temp_step: 0.5,
      supported_features: 1 | 128 | 256,
    },
    last_changed: at(Date.now() - 7200_000),
    last_updated: at(Date.now() - 300_000),
  };
}

const NAMES: Record<string, string> = {
  "sensor.hausverbrauch_leistung": "Hausverbrauch Leistung",
  "sensor.hausverbrauch_energie": "Hausverbrauch Energie",
  "sensor.netz_leistung": "Netz Leistung (Saldo)",
  "sensor.netzbezug_energie": "Netzbezug Zählerstand",
  "sensor.einspeisung_energie": "Einspeisung Zählerstand",
  "sensor.pv_leistung": "PV Leistung",
  "sensor.pv_energie": "PV Ertrag",
  "sensor.batterie_leistung": "Batterie Leistung (Saldo)",
  "sensor.kueche_stromkreis_leistung": "Stromkreis Küche Leistung",
  "sensor.kueche_stromkreis_energie": "Stromkreis Küche Energie",
  "sensor.kuehlschrank_leistung": "Kühlschrank Leistung",
  "sensor.kuehlschrank_energie": "Kühlschrank Energie",
  "sensor.herd_leistung": "Herd Leistung",
  "sensor.tv_steckdose_leistung": "TV-Steckdose Leistung",
  "sensor.tv_steckdose_energie": "TV-Steckdose Energie",
  "sensor.waschmaschine_leistung": "Waschmaschine Leistung",
  "sensor.waschmaschine_energie": "Waschmaschine Energie",
  "sensor.buero_steckdosenleiste_leistung": "Steckdosenleiste Büro Leistung",
  "sensor.buero_steckdosenleiste_energie": "Steckdosenleiste Büro Zählerstand",
  "sensor.waermepumpe_leistung": "Wärmepumpe Leistung",
  "sensor.waermepumpe_energie": "Wärmepumpe Energie",
};

const nameFor = (id: string) => NAMES[id] ?? id;

/** Leistungsaufnahme eingeschalteter Lampen in der Demo (geht in den Hausverbrauch ein). */
export const LIGHT_WATTS = 9;
