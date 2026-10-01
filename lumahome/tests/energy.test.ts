import { describe, expect, it } from "vitest";
import { buildTree, houseConsumption, roomAggregates, trackedSum, wouldCreateCycle, flowValues } from "@/energy/aggregate";
import { fromCumulative, fromPowerSamples, fromStatisticsChange, fromStatisticsMeanPower, makeBuckets, sumSeries } from "@/energy/series";
import { formatEnergy, formatPower, toKwh, toWatts } from "@/energy/units";
import { checkSource, livePowerValues } from "@/energy/live";
import type { HaState } from "@/devices/ha-types";
import { meter, twoRooms } from "./helpers";

const H = 3.6e6;
const T0 = new Date(2026, 8, 30, 0, 0, 0).getTime(); // 30.09.2026 00:00 lokal

const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HaState => ({
  entity_id, state, attributes, last_changed: "2026-10-01T10:00:00Z", last_updated: "2026-10-01T10:00:00Z",
});

describe("Einheiten", () => {
  it("trennt Leistung und Energie strikt", () => {
    expect(toWatts(1.5, "kW")).toBe(1500);
    expect(toWatts(1.5, "kWh")).toBeNull();
    expect(toKwh(500, "Wh")).toBe(0.5);
    expect(toKwh(500, "W")).toBeNull();
    expect(formatPower(1520)).toMatch(/kW$/);
    expect(formatPower(80)).toBe("80 W");
    expect(formatEnergy(2.345)).toMatch(/kWh$/);
    expect(formatEnergy(null)).toBe("–");
  });
  it("prüft Messquellen auf Einheit und Zustandsklasse", () => {
    expect(checkSource(st("sensor.a", "5", { unit_of_measurement: "W", device_class: "power" }), "power").ok).toBe(true);
    expect(checkSource(st("sensor.a", "5", { unit_of_measurement: "kWh" }), "power").ok).toBe(false);
    const meas = checkSource(st("sensor.b", "5", { unit_of_measurement: "kWh", device_class: "energy", state_class: "measurement" }), "energy");
    expect(meas.ok).toBe(false);
  });
  it("fehlende oder nicht verfügbare Werte werden nicht zu 0", () => {
    const m = [meter({ id: "m1", powerEntityId: "sensor.p" }), meter({ id: "m2", powerEntityId: "sensor.q" }), meter({ id: "m3" })];
    const v = livePowerValues(m, { "sensor.p": st("sensor.p", "unavailable", { unit_of_measurement: "W" }), "sensor.q": st("sensor.q", "12", { unit_of_measurement: "W" }) }, true);
    expect(v.get("m1")).toBeNull();
    expect(v.get("m2")).toBe(12);
    expect(v.has("m3")).toBe(false);
    const t = trackedSum(m, v);
    expect(t.value).toBe(12);
    expect(t.missing).toBe(1);
  });
});

describe("Zählerhierarchie ohne Doppelzählung", () => {
  const meters = [
    meter({ id: "main", isHouseMain: true, powerEntityId: "sensor.main" }),
    meter({ id: "kitchen", parentId: "main", roomId: "room_b", coversWholeRoom: true, powerEntityId: "sensor.k" }),
    meter({ id: "fridge", parentId: "kitchen", roomId: "room_b", powerEntityId: "sensor.f" }),
    meter({ id: "tv", parentId: "main", roomId: "room_a", powerEntityId: "sensor.tv" }),
  ];
  const values = new Map<string, number | null>([["main", 1000], ["kitchen", 400], ["fridge", 120], ["tv", 80]]);

  it("erfasste Summe zählt nur oberste Verbraucher", () => {
    expect(trackedSum(meters, values).value).toBe(480); // Küche (inkl. Kühlschrank) + TV, nicht +120
  });
  it("Baum mit nicht erfasstem Rest", () => {
    const [root] = buildTree(meters, values);
    expect(root.meter.id).toBe("main");
    expect(root.remainder).toBe(520);
    const k = root.children.find((c) => c.meter.id === "kitchen")!;
    expect(k.remainder).toBe(280);
  });
  it("Hauszähler hat Vorrang vor Summen", () => {
    const c = houseConsumption(meters, values, false);
    expect(c.basis).toBe("house_meter");
    expect(c.value).toBe(1000);
  });
  it("Raumwerte: vollständiger Raumzähler vs. erfasste Geräte", () => {
    const p = twoRooms();
    p.meters = meters;
    const rooms = roomAggregates(p, values);
    const kitchen = rooms.find((r) => r.roomId === "room_b")!;
    expect(kitchen.complete).toBe(true);
    expect(kitchen.value).toBe(400);
    const living = rooms.find((r) => r.roomId === "room_a")!;
    expect(living.complete).toBe(false);
    expect(living.value).toBe(80);
  });
  it("ohne Raumzähler werden Unterzähler im selben Raum nicht doppelt gezählt", () => {
    const p = twoRooms();
    p.meters = [
      meter({ id: "strip", roomId: "room_a", powerEntityId: "a" }),
      meter({ id: "pc", roomId: "room_a", parentId: "strip", powerEntityId: "b" }),
    ];
    const r = roomAggregates(p, new Map([["strip", 200], ["pc", 150]]));
    expect(r[0].value).toBe(200);
  });
  it("verhindert Kreise", () => {
    expect(wouldCreateCycle(meters, "main", "fridge")).toBe(true);
    expect(wouldCreateCycle(meters, "tv", "kitchen")).toBe(false);
  });
});

describe("Hausverbrauch mit PV und Speicher", () => {
  const flows = [
    meter({ id: "grid", flow: "grid_net", powerEntityId: "g" }),
    meter({ id: "pv", flow: "pv_production", powerEntityId: "p" }),
    meter({ id: "bat", flow: "battery_net", powerEntityId: "b" }),
    meter({ id: "tv", powerEntityId: "t" }),
  ];
  it("Netzleistung ist nicht der Hausverbrauch", () => {
    // Netz −1200 W (Einspeisung), PV 2500 W, Speicher lädt 600 W → Haus 700 W
    const v = new Map<string, number | null>([["grid", -1200], ["pv", 2500], ["bat", -600], ["tv", 90]]);
    const c = houseConsumption(flows, v, false);
    expect(c.basis).toBe("calculated_flows");
    expect(c.value).toBe(700);
    const f = flowValues(flows, v);
    expect(f.gridExport).toBe(1200);
    expect(f.batteryCharge).toBe(600);
  });
  it("nur Netzzähler ohne Bestätigung → nur erfasste Geräte", () => {
    const only = [meter({ id: "grid", flow: "grid_net", powerEntityId: "g" }), meter({ id: "tv", powerEntityId: "t" })];
    const v = new Map<string, number | null>([["grid", 900], ["tv", 90]]);
    const c = houseConsumption(only, v, false);
    expect(c.basis).toBe("tracked_devices");
    expect(c.label).toBe("Erfasste Geräte");
    expect(c.value).toBe(90);
    expect(houseConsumption(only, v, true).value).toBe(900);
  });
  it("fehlender Fluss → kein erfundener Wert", () => {
    const v = new Map<string, number | null>([["grid", 100], ["pv", null], ["bat", 0], ["tv", 90]]);
    expect(houseConsumption(flows, v, false).value).toBeNull();
  });
  it("Zeiträume: Netto-Flüsse werden getrennt integriert statt saldiert", () => {
    const m = [meter({ id: "grid", flow: "grid_net", powerEntityId: "g" }), meter({ id: "pv", flow: "pv_production", energyEntityId: "e" })];
    const values = new Map<string, number | null>([["pv", 10]]);
    const splits = new Map([["grid", { positive: 6, negative: 4 }]]);
    const c = houseConsumption(m, values, false, splits);
    expect(c.value).toBe(12); // 6 − 4 + 10
  });
});

describe("Zeitreihen", () => {
  const day = new Date(T0);
  const buckets = makeBuckets("day", day);
  const now = T0 + 24 * H;

  it("Tagesansicht hat 24 Stunden-Buckets", () => {
    expect(buckets).toHaveLength(24);
  });
  it("Statistik-Änderungen mit Lücke bleiben Lücke", () => {
    const rows = Array.from({ length: 24 }, (_, i) => ({ start: T0 + i * H, end: T0 + (i + 1) * H, change: 0.5 })).filter((_, i) => i < 3 || i > 5);
    const r = fromStatisticsChange(rows, buckets, 1, now);
    expect(r.buckets[4].value).toBeNull();
    expect(r.buckets[2].value).toBe(0.5);
    expect(r.total).toBeCloseTo(21 * 0.5);
    expect(r.coverage).toBeCloseTo(21 / 24);
  });
  it("Zählerstand mit Rücksetzung (Zählerwechsel)", () => {
    const samples = [
      { t: T0 + 0.5 * H, v: 100 },
      { t: T0 + 1.5 * H, v: 101 },
      { t: T0 + 2.5 * H, v: 0.3 }, // neuer Zähler
      { t: T0 + 3.5 * H, v: 1.3 },
    ];
    const r = fromCumulative(samples, buckets, 1, T0 + 4 * H);
    expect(r.buckets[1].value).toBeCloseTo(1);
    expect(r.buckets[2].value).toBeCloseTo(0.3);
    expect(r.buckets[2].reset).toBe(true);
    expect(r.buckets[3].value).toBeCloseTo(1);
    expect(r.total).toBeCloseTo(2.3);
  });
  it("Zählerstand: Nichtverfügbarkeit erzeugt Lücke und Nachholwert", () => {
    const samples = [
      { t: T0, v: 10 },
      { t: T0 + 1 * H, v: null },
      { t: T0 + 4 * H, v: 13 },
    ];
    const r = fromCumulative(samples, buckets, 1, T0 + 5 * H);
    expect(r.buckets[0].value).toBe(0);
    expect(r.buckets[2].value).toBeNull();
    expect(r.buckets[4].value).toBeCloseTo(3);
    expect(r.buckets[4].catchUp).toBe(true);
  });
  it("Leistung → Energie (berechnet) mit Lücke", () => {
    const samples = [
      { t: T0, v: 1000 },
      { t: T0 + 2 * H, v: null },
      { t: T0 + 3 * H, v: 500 },
    ];
    const r = fromPowerSamples(samples, buckets, "all", T0 + 4 * H);
    expect(r.calculated).toBe(true);
    expect(r.buckets[0].value).toBeCloseTo(1);
    expect(r.buckets[1].value).toBeCloseTo(1);
    expect(r.buckets[2].value).toBeNull();
    expect(r.buckets[3].value).toBeCloseTo(0.5);
    expect(r.buckets[5].value).toBeNull();
    expect(r.buckets[5].future).toBe(true);
    expect(r.total).toBeCloseTo(2.5);
  });
  it("Mittelwerte → Energie, getrennt nach Vorzeichen", () => {
    const rows = [{ start: T0, end: T0 + H, mean: -2000 }, { start: T0 + H, end: T0 + 2 * H, mean: 1000 }];
    expect(fromStatisticsMeanPower(rows, buckets, 1, "positive", now).total).toBeCloseTo(1);
    expect(fromStatisticsMeanPower(rows, buckets, 1, "negative", now).total).toBeCloseTo(2);
  });
  it("Summe mehrerer Reihen ist bei fehlendem Wert unvollständig", () => {
    const a = fromStatisticsChange([{ start: T0, end: T0 + H, change: 1 }], buckets, 1, now).buckets;
    const b = fromStatisticsChange([], buckets, 1, now).buckets;
    expect(sumSeries([a, b])[0].value).toBeNull();
  });
  it("Woche und Monat", () => {
    expect(makeBuckets("week", new Date(2026, 9, 1))).toHaveLength(7);
    expect(makeBuckets("month", new Date(2026, 9, 15))).toHaveLength(31);
    expect(new Date(makeBuckets("week", new Date(2026, 9, 1))[0].start).getDay()).toBe(1);
  });
});
