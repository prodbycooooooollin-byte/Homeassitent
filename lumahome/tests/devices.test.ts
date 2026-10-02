import { describe, expect, it } from "vitest";
import { capabilityOf } from "@/devices/capabilities";
import { contactView, freshness, kelvinToHex, lightView, stateSummary } from "@/devices/state";
import { rankCandidates } from "@/devices/suggestions";
import { isAllowedService } from "@/devices/ha-types";
import type { HaState } from "@/devices/ha-types";
import { twoRooms } from "./helpers";

const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}, extra: Partial<HaState> = {}): HaState => ({
  entity_id, state, attributes, last_changed: new Date().toISOString(), last_updated: new Date().toISOString(), ...extra,
});

describe("Fähigkeiten", () => {
  it("Licht: Helligkeit, Farbtemperatur und Farbe nach supported_color_modes", () => {
    const onoff = capabilityOf(st("light.a", "on", { supported_color_modes: ["onoff"] }));
    expect(onoff).toMatchObject({ kind: "light", brightness: false, colorTemp: null, color: false });
    const ct = capabilityOf(st("light.b", "on", { supported_color_modes: ["color_temp", "hs"], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500 }));
    expect(ct).toMatchObject({ kind: "light", brightness: true, color: true, colorTemp: { min: 2000, max: 6500 } });
  });
  it("Rollladen nur mit unterstützten Aktionen", () => {
    expect(capabilityOf(st("cover.a", "open", { supported_features: 3 }))).toMatchObject({ open: true, close: true, stop: false, position: false });
    expect(capabilityOf(st("cover.b", "open", { supported_features: 15 }))).toMatchObject({ position: true, stop: true });
  });
  it("Fensterkontakt ist nur lesbar", () => {
    const c = capabilityOf(st("binary_sensor.f", "on", { device_class: "window" }));
    expect(c.kind).toBe("contact");
    expect(contactView(st("binary_sensor.f", "on"))).toBe("open");
    const tilt = capabilityOf(st("sensor.griff", "tilted", { device_class: "enum", options: ["open", "closed", "tilted"] }));
    expect(tilt).toMatchObject({ kind: "contact", canTilt: true });
  });
  it("Heizung: Modi und Sollwertbereich", () => {
    const c = capabilityOf(st("climate.h", "heat", { hvac_modes: ["off", "heat"], supported_features: 1, min_temp: 5, max_temp: 28, target_temp_step: 0.5 }));
    expect(c).toMatchObject({ kind: "climate", hvacModes: ["off", "heat"], target: { min: 5, max: 28, step: 0.5 }, canTurnOff: true });
    const noTarget = capabilityOf(st("climate.h2", "heat", { hvac_modes: ["heat"], supported_features: 0 }));
    expect(noTarget).toMatchObject({ target: null });
  });
});

describe("Zustände", () => {
  it("unterscheidet unbekannt, nicht verfügbar und veraltet", () => {
    expect(freshness(undefined, true).availability).toBe("missing");
    expect(freshness(st("light.a", "unavailable"), true).availability).toBe("unavailable");
    expect(freshness(st("light.a", "unknown"), true).availability).toBe("unknown");
    expect(freshness(st("light.a", "on"), false).availability).toBe("stale");
    const old = new Date(Date.now() - 5 * 3600_000).toISOString();
    expect(freshness(st("sensor.t", "21", {}, { last_reported: old, last_updated: old }), true).availability).toBe("stale");
  });
  it("Lichtwerte und Zusammenfassung", () => {
    const l = lightView(st("light.a", "on", { brightness: 128, color_temp_kelvin: 2700 }));
    expect(l.brightnessPct).toBe(50);
    expect(stateSummary({ kind: "light", brightness: true, colorTemp: null, color: false }, st("light.a", "on", { brightness: 255 }))).toBe("An · 100 %");
    expect(kelvinToHex(6600)).toMatch(/^#ff/i);
  });
});

describe("Zuordnungsvorschläge", () => {
  it("bevorzugt passende Bereiche und begründet den Vorschlag", () => {
    const p = twoRooms();
    p.items = [{ id: "lamp", floorId: "floor_eg", catalogId: "floor-lamp", name: "Stehleuchte", x: 1, y: 1, elevation: 0, rotation: 0, width: 0.4, depth: 0.4, height: 1.6, material: "stoff", color: "#ffffff", acceptedIssues: [] }];
    const states = {
      "light.kueche": st("light.kueche", "off", { friendly_name: "Küche Decke", supported_color_modes: ["onoff"] }),
      "light.stehleuchte_wz": st("light.stehleuchte_wz", "off", { friendly_name: "Stehleuchte Wohnzimmer", supported_color_modes: ["brightness"] }),
      "sensor.temp": st("sensor.temp", "21", { device_class: "temperature", unit_of_measurement: "°C" }),
    };
    const c = rankCandidates({ project: p, target: { kind: "item", id: "lamp" }, roomName: "Wohnzimmer", states, registry: null });
    expect(c[0].entityId).toBe("light.stehleuchte_wz");
    expect(c[0].reasons.length).toBeGreaterThan(0);
    expect(c.find((x) => x.entityId === "sensor.temp")).toBeUndefined();
  });
});

describe("Dienstfreigabe", () => {
  it("lässt nur unterstützte Steuerdienste zu", () => {
    expect(isAllowedService("light", "turn_on")).toBe(true);
    expect(isAllowedService("homeassistant", "restart")).toBe(false);
    expect(isAllowedService("lock", "unlock")).toBe(false);
  });
});
