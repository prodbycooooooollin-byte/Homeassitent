// Simulierter Home-Assistant-Server für Entwicklung und automatisierte Tests.
// Implementiert die benötigten Teile der WebSocket-API
// (auth, get_states, subscribe_events, call_service, Registries,
// recorder/list_statistic_ids, recorder/statistics_during_period,
// history/history_during_period, energy/get_prefs) sowie eine
// HTTP-Steuerschnittstelle, um externe Änderungen und Verbindungsabbrüche
// auszulösen. Es handelt sich ausdrücklich NICHT um echte Geräte.
//
//   node tools/fake-ha/server.mjs [port] [token]
//   POST /control/set     {"entity_id": "...", "state": "...", "attributes": {...}}
//   POST /control/drop    trennt alle WebSocket-Verbindungen
//   POST /control/refuse  {"ms": 5000} lehnt neue Verbindungen zeitweise ab
//   GET  /control/calls   bisher empfangene Dienstaufrufe
import http from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.argv[2] ?? process.env.FAKE_HA_PORT ?? 18123);
const TOKEN = process.argv[3] ?? process.env.FAKE_HA_TOKEN ?? "test-token";
const H = 3600_000;

const iso = (t = Date.now()) => new Date(t).toISOString();
let ctxN = 0;
const ctx = (prefix = "ctx") => ({ id: `${prefix}-${Date.now().toString(36)}-${++ctxN}`, parent_id: null, user_id: null });

function st(entity_id, state, attributes) {
  const t = iso();
  return { entity_id, state, attributes, last_changed: t, last_updated: t, last_reported: t, context: ctx("init") };
}

const states = new Map();
function reset() {
  states.clear();
  [
    st("light.wohnzimmer", "off", { friendly_name: "Wohnzimmer Decke", supported_color_modes: ["color_temp"], min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 }),
    st("light.kueche", "off", { friendly_name: "Küche Licht", supported_color_modes: ["onoff"] }),
    st("switch.tv_steckdose", "on", { friendly_name: "TV Steckdose", device_class: "outlet" }),
    st("sensor.tv_leistung", "87.5", { friendly_name: "TV Leistung", unit_of_measurement: "W", device_class: "power", state_class: "measurement" }),
    st("sensor.tv_energie", "123.45", { friendly_name: "TV Energie", unit_of_measurement: "kWh", device_class: "energy", state_class: "total_increasing" }),
    st("sensor.hauszaehler_leistung", "1.25", { friendly_name: "Hauszähler Leistung", unit_of_measurement: "kW", device_class: "power", state_class: "measurement" }),
    st("sensor.hauszaehler_energie", "9876.5", { friendly_name: "Hauszähler Energie", unit_of_measurement: "kWh", device_class: "energy", state_class: "total_increasing" }),
    st("sensor.wohnzimmer_temperatur", "21.3", { friendly_name: "Wohnzimmer Temperatur", unit_of_measurement: "°C", device_class: "temperature", state_class: "measurement" }),
    st("binary_sensor.wohnzimmer_fenster", "off", { friendly_name: "Wohnzimmer Fenster", device_class: "window" }),
    st("cover.wohnzimmer_rollladen", "open", { friendly_name: "Wohnzimmer Rollladen", current_position: 100, supported_features: 15 }),
    st("climate.wohnzimmer", "heat", { friendly_name: "Wohnzimmer Heizung", hvac_modes: ["off", "heat"], current_temperature: 21.3, temperature: 21, min_temp: 5, max_temp: 28, target_temp_step: 0.5, supported_features: 385 }),
  ].forEach((s) => states.set(s.entity_id, s));
}
reset();

const registry = {
  areas: [{ area_id: "wohnzimmer", name: "Wohnzimmer" }, { area_id: "kueche", name: "Küche" }],
  devices: [{ id: "dev_tv", name: "TV Stecker", area_id: "wohnzimmer" }],
  entities: [
    { entity_id: "light.wohnzimmer", area_id: "wohnzimmer", device_id: null, name: null },
    { entity_id: "light.kueche", area_id: "kueche", device_id: null, name: null },
    { entity_id: "switch.tv_steckdose", area_id: null, device_id: "dev_tv", name: null },
    { entity_id: "sensor.tv_leistung", area_id: null, device_id: "dev_tv", name: null },
  ],
};

const clients = new Set();
const calls = [];
let refuseUntil = 0;

function broadcast(entity_id, new_state, old_state) {
  for (const c of clients) {
    for (const subId of c.subs) {
      c.ws.send(JSON.stringify({ id: subId, type: "event", event: { event_type: "state_changed", data: { entity_id, old_state, new_state }, origin: "LOCAL", time_fired: iso(), context: new_state?.context } }));
    }
  }
}

function setState(entity_id, state, attributes, context) {
  const old = states.get(entity_id);
  const t = iso();
  const next = { entity_id, state, attributes: attributes ?? old?.attributes ?? {}, last_changed: old && old.state === state ? old.last_changed : t, last_updated: t, last_reported: t, context: context ?? ctx("ext") };
  states.set(entity_id, next);
  broadcast(entity_id, next, old);
  return next;
}

function applyService(domain, service, entityId, data, context) {
  const s = states.get(entityId);
  if (!s) throw new Error(`Entity ${entityId} not found`);
  const a = { ...s.attributes };
  let state = s.state;
  switch (`${domain}.${service}`) {
    case "light.turn_on":
      state = "on";
      if ((a.supported_color_modes ?? []).some((m) => m !== "onoff")) a.brightness = data.brightness_pct !== undefined ? Math.round((data.brightness_pct / 100) * 255) : a.brightness ?? 255;
      if (data.color_temp_kelvin) a.color_temp_kelvin = data.color_temp_kelvin;
      break;
    case "light.turn_off":
    case "switch.turn_off":
      state = "off";
      delete a.brightness;
      break;
    case "switch.turn_on":
      state = "on";
      break;
    case "light.toggle":
    case "switch.toggle":
      state = s.state === "on" ? "off" : "on";
      break;
    case "cover.open_cover":
      state = "open";
      a.current_position = 100;
      break;
    case "cover.close_cover":
      state = "closed";
      a.current_position = 0;
      break;
    case "cover.set_cover_position":
      a.current_position = data.position;
      state = data.position > 0 ? "open" : "closed";
      break;
    case "cover.stop_cover":
      break;
    case "climate.set_temperature":
      a.temperature = data.temperature;
      break;
    case "climate.set_hvac_mode":
      state = data.hvac_mode;
      break;
    default:
      throw new Error(`Service ${domain}.${service} not supported by fake`);
  }
  setTimeout(() => setState(entityId, state, a, context), 250);
}

/** Stündliche Statistik für heute bis zur letzten vollen Stunde, mit Lücke 02:00–05:00. */
function statistics(ids, start, end, period) {
  const out = {};
  const now = Date.now();
  for (const id of ids) {
    const rows = [];
    const cur = new Date(start);
    if (period === "day") cur.setHours(0, 0, 0, 0);
    else cur.setMinutes(0, 0, 0);
    while (cur.getTime() < end) {
      const s = cur.getTime();
      if (period === "day") cur.setDate(cur.getDate() + 1);
      else if (period === "5minute") cur.setMinutes(cur.getMinutes() + 5);
      else cur.setHours(cur.getHours() + 1);
      const e = cur.getTime();
      if (e > now && period !== "day") break;
      const h = new Date(s).getHours();
      if (period === "hour" && h >= 2 && h < 5 && new Date(s).toDateString() === new Date().toDateString()) continue;
      const factor = period === "day" ? 24 : period === "5minute" ? 1 / 12 : 1;
      if (id === "sensor.tv_leistung") rows.push({ start: s, end: e, mean: 80 });
      if (id === "sensor.hauszaehler_leistung") rows.push({ start: s, end: e, mean: 0.5 });
      if (id === "sensor.tv_energie") rows.push({ start: s, end: e, change: 0.08 * factor });
      if (id === "sensor.hauszaehler_energie") rows.push({ start: s, end: e, change: 0.5 * factor });
    }
    if (rows.length) out[id] = rows;
  }
  return out;
}

function handle(c, msg) {
  const reply = (result) => c.ws.send(JSON.stringify({ id: msg.id, type: "result", success: true, result }));
  const fail = (code, message) => c.ws.send(JSON.stringify({ id: msg.id, type: "result", success: false, error: { code, message } }));
  switch (msg.type) {
    case "ping":
      return c.ws.send(JSON.stringify({ id: msg.id, type: "pong" }));
    case "subscribe_events":
      c.subs.add(msg.id);
      return reply(null);
    case "get_states":
      return reply([...states.values()]);
    case "config/entity_registry/list":
      return reply(registry.entities);
    case "config/area_registry/list":
      return reply(registry.areas);
    case "config/device_registry/list":
      return reply(registry.devices);
    case "call_service": {
      const entityId = msg.target?.entity_id;
      calls.push({ domain: msg.domain, service: msg.service, entity_id: entityId, data: msg.service_data, at: Date.now() });
      const context = ctx("call");
      try {
        applyService(msg.domain, msg.service, entityId, msg.service_data ?? {}, context);
      } catch (e) {
        return fail("not_found", e.message);
      }
      return reply({ context });
    }
    case "recorder/list_statistic_ids":
      return reply([
        { statistic_id: "sensor.tv_leistung", has_mean: true, has_sum: false, statistics_unit_of_measurement: "W", source: "recorder" },
        { statistic_id: "sensor.hauszaehler_leistung", has_mean: true, has_sum: false, statistics_unit_of_measurement: "kW", source: "recorder" },
        { statistic_id: "sensor.tv_energie", has_mean: false, has_sum: true, statistics_unit_of_measurement: "kWh", source: "recorder" },
        { statistic_id: "sensor.hauszaehler_energie", has_mean: false, has_sum: true, statistics_unit_of_measurement: "kWh", source: "recorder" },
      ]);
    case "recorder/statistics_during_period":
      return reply(statistics(msg.statistic_ids, Date.parse(msg.start_time), Date.parse(msg.end_time), msg.period));
    case "history/history_during_period":
      return reply({});
    case "energy/get_prefs":
      return reply({ energy_sources: [{ type: "grid", flow_from: [{ stat_energy_from: "sensor.hauszaehler_energie" }], flow_to: [] }], device_consumption: [{ stat_consumption: "sensor.tv_energie" }] });
    default:
      return fail("unknown_command", `Unknown command ${msg.type}`);
  }
}

const server = http.createServer(async (req, res) => {
  const body = await new Promise((r) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => r(d ? JSON.parse(d) : {}));
  });
  const json = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.url === "/control/set" && req.method === "POST") return json(200, setState(body.entity_id, body.state, body.attributes));
  if (req.url === "/control/drop" && req.method === "POST") {
    for (const c of clients) c.ws.terminate();
    return json(200, { dropped: clients.size });
  }
  if (req.url === "/control/refuse" && req.method === "POST") {
    refuseUntil = Date.now() + Number(body.ms ?? 5000);
    return json(200, { refuseUntil });
  }
  if (req.url === "/control/calls") return json(200, calls);
  if (req.url === "/control/reset" && req.method === "POST") {
    reset();
    calls.length = 0;
    return json(200, { ok: true });
  }
  json(404, { error: "not found" });
});

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/api/websocket" || Date.now() < refuseUntil) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const c = { ws, authed: false, subs: new Set() };
    ws.send(JSON.stringify({ type: "auth_required", ha_version: "2026.9.0-fake" }));
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (!c.authed) {
        if (msg.type === "auth" && msg.access_token === TOKEN) {
          c.authed = true;
          clients.add(c);
          ws.send(JSON.stringify({ type: "auth_ok", ha_version: "2026.9.0-fake" }));
        } else {
          ws.send(JSON.stringify({ type: "auth_invalid", message: "Invalid access token" }));
          ws.close();
        }
        return;
      }
      handle(c, msg);
    });
    ws.on("close", () => clients.delete(c));
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`Fake-HA (simuliert) auf http://127.0.0.1:${PORT}, Token: ${TOKEN}`));
