import { describe, expect, it } from "vitest";
import { solarPosition } from "@/environment/sun";
import { resolveEnvironment, skyFromCondition, sunStrength } from "@/environment/weather";
import { computeInsights, baseLoad, partialSum } from "@/energy/insights";
import { buildWalls } from "@/geometry/walls";
import { computeFlows } from "@/energy/flows3d";
import { demoProject } from "@/demo/house";
import { makeRoom, rectVertices } from "@/geometry/ops";
import type { HaState } from "@/devices/ha-types";
import { twoRooms } from "./helpers";

const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HaState => ({
  entity_id, state, attributes, last_changed: new Date().toISOString(), last_updated: new Date().toISOString(),
});

describe("Sonnenstand", () => {
  it("Mittag zur Sommersonnenwende in Berlin: hoch im Süden", () => {
    const p = solarPosition(new Date("2026-06-21T11:10:00Z"), 52.52, 13.4);
    expect(p.elevation).toBeGreaterThan(59);
    expect(p.elevation).toBeLessThan(62);
    expect(p.azimuth).toBeGreaterThan(170);
    expect(p.azimuth).toBeLessThan(190);
  });
  it("Mitternacht: unter dem Horizont", () => {
    expect(solarPosition(new Date("2026-12-21T23:00:00Z"), 52.52, 13.4).elevation).toBeLessThan(-30);
  });
  it("Morgens im Osten, abends im Westen", () => {
    expect(solarPosition(new Date("2026-03-20T06:30:00Z"), 51, 10).azimuth).toBeLessThan(120);
    expect(solarPosition(new Date("2026-03-20T16:30:00Z"), 51, 10).azimuth).toBeGreaterThan(240);
  });
});

describe("Wetter", () => {
  it("bildet Home-Assistant-Zustände ab", () => {
    expect(skyFromCondition("rainy")).toBe("rain");
    expect(skyFromCondition("lightning-rainy")).toBe("storm");
    expect(skyFromCondition("clear-night")).toBe("clear");
    expect(skyFromCondition("irgendwas")).toBe("unknown");
  });
  it("nutzt sun.sun und weather.* und kennzeichnet die Quelle", () => {
    const env = resolveEnvironment({
      states: { "weather.home": st("weather.home", "rainy", { temperature: 9.5 }), "sun.sun": st("sun.sun", "above_horizon", { elevation: 30, azimuth: 160 }) },
      weatherEntityId: null, latitude: 51, longitude: 10, preview: null,
    });
    expect(env).toMatchObject({ sky: "rain", elevation: 30, temperature: 9.5, weatherSource: "ha", sunSource: "ha" });
    expect(sunStrength(env)).toBeLessThan(0.2);
  });
  it("ohne Daten: Sonnenstand geschätzt, Wetter unbekannt (nicht erfunden)", () => {
    const env = resolveEnvironment({ states: {}, weatherEntityId: null, latitude: 51, longitude: 10, preview: null });
    expect(env.sky).toBe("unknown");
    expect(env.weatherSource).toBe("none");
    expect(env.sunSource).toBe("estimated");
  });
  it("Vorschau überschreibt sichtbar", () => {
    const env = resolveEnvironment({ states: {}, weatherEntityId: null, latitude: 51, longitude: 10, preview: { sky: "snow", hour: 23 } });
    expect(env).toMatchObject({ sky: "snow", weatherSource: "preview", sunSource: "preview", isNight: true });
  });
});

describe("Analyse-Kennzahlen", () => {
  const flows = { gridImport: 4, gridExport: 6, pv: 16, batteryCharge: 3, batteryDischarge: 2, hasGrid: true, hasPv: true, hasBattery: true };
  const house = { value: 13, basis: "calculated_flows" as const, label: "", note: null };
  const t = { pricePerKwh: 0.3, feedInPerKwh: 0.08, co2PerKwh: 0.4 };
  it("Autarkie, Eigenverbrauch, Ersparnis", () => {
    const i = computeInsights(flows, house, t);
    expect(i.autarky).toBeCloseTo(1 - 4 / 13);
    expect(i.selfConsumption).toBeCloseTo(10 / 16);
    expect(i.savings).toBeCloseTo(3);
    expect(i.feedInRevenue).toBeCloseTo(0.48);
    expect(i.gridCost).toBeCloseTo(1.2);
    expect(i.co2Avoided).toBeCloseTo(4);
  });
  it("ohne Gesamtverbrauch keine Autarkie – mit Begründung", () => {
    const i = computeInsights(flows, { value: 5, basis: "tracked_devices", label: "", note: null }, t);
    expect(i.autarky).toBeNull();
    expect(i.autarkyReason).toMatch(/Gesamtverbrauch/);
  });
  it("Grundlast aus vollständigen Stunden", () => {
    const H = 3.6e6;
    const b = Array.from({ length: 24 }, (_, i) => ({ start: i * H, end: (i + 1) * H, value: i < 6 ? 0.2 : 0.8, coverage: 1, catchUp: false, reset: false, future: false }));
    expect(baseLoad(b, 24 * H)).toBeCloseTo(200);
    expect(baseLoad(b.slice(0, 5), 24 * H)).toBeNull();
    expect(partialSum(b, 2)).toBeCloseTo(0.4);
  });
});

describe("Außenbereiche und Stromflüsse", () => {
  it("Außenbereich erzeugt keine Wände und lässt Außenwände des Hauses unverändert", () => {
    const p = twoRooms();
    p.rooms.push({ ...makeRoom("floor_eg", "Terrasse", rectVertices(-3, 0, 3, 4)), outdoor: true });
    const walls = buildWalls(p, p.floors[0]);
    expect(walls.some((w) => w.roomId === p.rooms[2].id)).toBe(false);
    const west = walls.filter((w) => Math.abs(w.a.x) < 1e-6 && Math.abs(w.b.x) < 1e-6);
    expect(west.every((w) => w.exterior)).toBe(true);
  });
  it("Flüsse laufen über den Verteiler; Laden und Entladen haben die richtige Richtung", () => {
    const p = demoProject();
    const states: Record<string, HaState> = {
      "sensor.pv_leistung": st("sensor.pv_leistung", "3000", { unit_of_measurement: "W" }),
      "sensor.netz_leistung": st("sensor.netz_leistung", "-500", { unit_of_measurement: "W" }),
      "sensor.batterie_1_leistung": st("sensor.batterie_1_leistung", "-800", { unit_of_measurement: "W" }),
      "sensor.batterie_2_leistung": st("sensor.batterie_2_leistung", "400", { unit_of_measurement: "W" }),
      "sensor.batterie_3_leistung": st("sensor.batterie_3_leistung", "0", { unit_of_measurement: "W" }),
      "sensor.batterie_1_ladestand": st("sensor.batterie_1_ladestand", "55", { unit_of_measurement: "%" }),
      "sensor.whirlpool_leistung": st("sensor.whirlpool_leistung", "2800", { unit_of_measurement: "W" }),
    };
    const { flows, nodes } = computeFlows(p, states, true);
    const hub = nodes.hub;
    const pv = flows.find((f) => f.kind === "pv")!;
    expect(pv.path[pv.path.length - 1]).toEqual(hub);
    const charging = flows.find((f) => f.key === "bat:m_akku1")!;
    expect(charging.path[0]).toEqual(hub);
    expect(charging.label).toBe("lädt");
    const discharging = flows.find((f) => f.key === "bat:m_akku2")!;
    expect(discharging.path[discharging.path.length - 1]).toEqual(hub);
    expect(flows.find((f) => f.key === "bat:m_akku3")).toBeUndefined();
    const grid = flows.find((f) => f.kind === "grid")!;
    expect(grid.label).toBe("Einspeisung");
    expect(grid.path[0]).toEqual(hub);
    const pool = flows.find((f) => f.key === "use:m_whirlpool")!;
    expect(pool.watts).toBe(2800);
    expect(pool.path[0]).toEqual(hub);
    expect(nodes.batteries.find((b) => b.meter.id === "m_akku1")!.soc).toBe(55);
    // Unterzähler-Eltern (Küchenstromkreis) erhalten kein eigenes Kabel – keine Doppeldarstellung
    expect(flows.find((f) => f.key === "use:m_kueche")).toBeUndefined();
    // Fehlende Werte erzeugen keine Kabel
    expect(flows.find((f) => f.key === "use:m_tv")).toBeUndefined();
  });
});
