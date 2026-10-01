// Zusammenfassung von Messwerten über die Zählerhierarchie.
//
// Die Funktionen arbeiten auf einer Wertetabelle (Messpunkt → Wert) und sind
// damit für Momentanleistung (W) und Energiemengen eines Zeitraums (kWh)
// gleichermaßen nutzbar. Konvention der Tabelle:
//   kein Eintrag (undefined) → Messpunkt hat für diese Größe keine Quelle
//   null                     → Quelle vorhanden, aber derzeit kein Wert
//   Zahl                     → gemessener bzw. berechneter Wert Doppelzählungen werden vermieden: Ein Messpunkt mit
// übergeordnetem Zähler geht nie zusätzlich zu diesem in eine Summe ein.
import type { EnergyMeter, Project } from "@/model/types";
import { itemRoom } from "@/geometry/placement";

export type Values = Map<string, number | null>;

export interface MeterNode {
  meter: EnergyMeter;
  value: number | null;
  children: MeterNode[];
  /** Nicht von Unterzählern erfasster Rest (nur wenn alle Werte bekannt sind) */
  remainder: number | null;
}

export const isConsumer = (m: EnergyMeter) => m.flow === "consumption";

export function houseMain(meters: EnergyMeter[]): EnergyMeter | null {
  return meters.find((m) => m.isHouseMain && isConsumer(m)) ?? null;
}

const has = (values: Values, id: string) => values.has(id);

/** Oberste Verbrauchs-Messpunkte unterhalb des Hauszählers (bzw. ohne übergeordneten Zähler). */
export function consumerRoots(meters: EnergyMeter[]): EnergyMeter[] {
  const main = houseMain(meters);
  return meters.filter((m) => isConsumer(m) && !m.isHouseMain && (m.parentId === null || m.parentId === main?.id));
}

export function childrenOf(meters: EnergyMeter[], id: string): EnergyMeter[] {
  return meters.filter((m) => m.parentId === id && isConsumer(m));
}

export function ancestors(meters: EnergyMeter[], m: EnergyMeter): EnergyMeter[] {
  const byId = new Map(meters.map((x) => [x.id, x]));
  const out: EnergyMeter[] = [];
  let cur = m.parentId ? byId.get(m.parentId) : undefined;
  while (cur && !out.includes(cur)) {
    out.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

/** Würde parentId einen Kreis erzeugen? */
export function wouldCreateCycle(meters: EnergyMeter[], id: string, parentId: string | null): boolean {
  if (!parentId) return false;
  if (parentId === id) return true;
  const byId = new Map(meters.map((x) => [x.id, x]));
  let cur = byId.get(parentId);
  const seen = new Set<string>();
  while (cur) {
    if (cur.id === id) return true;
    if (seen.has(cur.id)) return true;
    seen.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

export function buildTree(meters: EnergyMeter[], values: Values): MeterNode[] {
  const make = (m: EnergyMeter, depth: number): MeterNode => {
    const children = depth > 10 ? [] : childrenOf(meters, m.id).filter((c) => has(values, c.id)).map((c) => make(c, depth + 1));
    const value = values.get(m.id) ?? null;
    let remainder: number | null = null;
    if (children.length && value !== null && children.every((c) => c.value !== null)) {
      remainder = value - children.reduce((s, c) => s + (c.value ?? 0), 0);
    }
    return { meter: m, value, children, remainder };
  };
  const main = houseMain(meters);
  if (main && has(values, main.id)) return [make(main, 0)];
  return consumerRoots(meters).filter((m) => has(values, m.id)).map((m) => make(m, 0));
}

export interface TrackedSum {
  value: number | null;
  /** Anzahl Messpunkte mit Wert */
  measured: number;
  /** Messpunkte ohne aktuellen Wert */
  missing: number;
}

/** Summe der obersten erfassten Verbraucher (ohne Hauszähler, ohne Unterzähler). */
export function trackedSum(meters: EnergyMeter[], values: Values): TrackedSum {
  let value = 0;
  let measured = 0;
  let missing = 0;
  for (const m of consumerRoots(meters)) {
    if (!has(values, m.id)) continue;
    const v = values.get(m.id);
    if (v === null || v === undefined) missing++;
    else {
      value += v;
      measured++;
    }
  }
  return { value: measured ? value : null, measured, missing };
}

export type ConsumptionBasis = "house_meter" | "calculated_flows" | "grid_only" | "tracked_devices" | "none";

export interface FlowValues {
  gridImport: number | null;
  gridExport: number | null;
  pv: number | null;
  batteryCharge: number | null;
  batteryDischarge: number | null;
  hasGrid: boolean;
  hasPv: boolean;
  hasBattery: boolean;
}

export interface Consumption {
  value: number | null;
  basis: ConsumptionBasis;
  label: string;
  note: string | null;
}

export type Splits = Map<string, { positive: number | null; negative: number | null }>;

/**
 * Werte der Energieflüsse. Netto-Messpunkte werden in Bezug/Einspeisung bzw.
 * Laden/Entladen zerlegt. Für Zeiträume müssen die Anteile getrennt integriert
 * vorliegen (splits) – ein saldierter Wert würde Bezug und Einspeisung verrechnen.
 */
export function flowValues(meters: EnergyMeter[], values: Values, splits?: Splits): FlowValues {
  const get = (flow: EnergyMeter["flow"]) => meters.filter((m) => m.flow === flow && (has(values, m.id) || !!splits?.has(m.id)));
  const splitSum = (ms: EnergyMeter[], part: "positive" | "negative") => {
    let s = 0;
    for (const m of ms) {
      const v = splits!.get(m.id)?.[part];
      if (v === null || v === undefined) return null;
      s += v;
    }
    return s;
  };
  const sum = (ms: EnergyMeter[]) => {
    if (!ms.length) return null;
    let s = 0;
    for (const m of ms) {
      const v = values.get(m.id);
      if (v === null || v === undefined) return null;
      s += v;
    }
    return s;
  };
  let gridImport = sum(get("grid_import"));
  let gridExport = sum(get("grid_export"));
  // Getrennte Bezugs-/Einspeisezähler haben Vorrang vor einem Netto-Zähler
  const dedicatedGrid = get("grid_import").length + get("grid_export").length > 0;
  const net = dedicatedGrid ? [] : get("grid_net");
  if (net.length && splits) {
    const pos = splitSum(net, "positive");
    const neg = splitSum(net, "negative");
    gridImport = pos === null ? null : pos + (gridImport ?? 0);
    gridExport = neg === null ? null : neg + (gridExport ?? 0);
  } else if (net.length) {
    const n = sum(net);
    gridImport = n === null ? null : Math.max(0, n) + (gridImport ?? 0);
    gridExport = n === null ? null : Math.max(0, -n) + (gridExport ?? 0);
  }
  let batteryCharge = sum(get("battery_charge"));
  let batteryDischarge = sum(get("battery_discharge"));
  const dedicatedBattery = get("battery_charge").length + get("battery_discharge").length > 0;
  const bnet = dedicatedBattery ? [] : get("battery_net");
  if (bnet.length && splits) {
    const pos = splitSum(bnet, "positive");
    const neg = splitSum(bnet, "negative");
    batteryDischarge = pos === null ? null : pos + (batteryDischarge ?? 0);
    batteryCharge = neg === null ? null : neg + (batteryCharge ?? 0);
  } else if (bnet.length) {
    const n = sum(bnet);
    // Konvention: positiv = Entladen ins Haus, negativ = Laden
    batteryDischarge = n === null ? null : Math.max(0, n) + (batteryDischarge ?? 0);
    batteryCharge = n === null ? null : Math.max(0, -n) + (batteryCharge ?? 0);
  }
  return {
    gridImport,
    gridExport,
    pv: sum(get("pv_production")),
    batteryCharge,
    batteryDischarge,
    hasGrid: dedicatedGrid || net.length > 0,
    hasPv: get("pv_production").length > 0,
    hasBattery: dedicatedBattery || bnet.length > 0,
  };
}

/**
 * Gesamtverbrauch des Hauses mit offengelegter Grundlage.
 * Netzbezug gilt nur dann als Hausverbrauch, wenn PV und Speicher einbezogen
 * oder ausdrücklich ausgeschlossen sind.
 */
export function houseConsumption(meters: EnergyMeter[], values: Values, noLocalGeneration: boolean, splits?: Splits): Consumption {
  const main = houseMain(meters);
  if (main && has(values, main.id)) {
    const v = values.get(main.id) ?? null;
    return { value: v, basis: "house_meter", label: "Hausverbrauch", note: v === null ? "Hauszähler liefert derzeit keinen Wert." : null };
  }
  const f = flowValues(meters, values, splits);
  if (f.hasGrid && (f.hasPv || f.hasBattery)) {
    const parts = [f.gridImport, f.gridExport, f.hasPv ? f.pv : 0, f.hasBattery ? f.batteryCharge : 0, f.hasBattery ? f.batteryDischarge : 0];
    if (parts.some((x) => x === null)) {
      return { value: null, basis: "calculated_flows", label: "Hausverbrauch (berechnet)", note: "Mindestens ein Energiefluss liefert derzeit keinen Wert." };
    }
    const v = (f.gridImport ?? 0) - (f.gridExport ?? 0) + (f.pv ?? 0) + (f.batteryDischarge ?? 0) - (f.batteryCharge ?? 0);
    return { value: Math.max(0, v), basis: "calculated_flows", label: "Hausverbrauch (berechnet)", note: "Netzbezug − Einspeisung + PV-Erzeugung + Speicher-Entladung − Speicher-Ladung" };
  }
  if (f.hasGrid && noLocalGeneration) {
    if (f.gridImport === null) return { value: null, basis: "grid_only", label: "Hausverbrauch (aus Netzbezug)", note: "Netzzähler liefert derzeit keinen Wert." };
    return { value: Math.max(0, f.gridImport - (f.gridExport ?? 0)), basis: "grid_only", label: "Hausverbrauch (aus Netzbezug)", note: "Bestätigt: keine eigene Erzeugung und kein Speicher." };
  }
  const t = trackedSum(meters, values);
  if (t.measured + t.missing > 0) {
    const note = f.hasGrid
      ? "Netzbezug ist nicht automatisch der Hausverbrauch. Ohne Hauszähler wird nur die Summe der erfassten Geräte gezeigt."
      : "Kein Hauszähler zugeordnet – die Summe enthält nur erfasste Geräte und ist unvollständig.";
    return { value: t.value, basis: "tracked_devices", label: "Erfasste Geräte", note };
  }
  return { value: null, basis: "none", label: "Hausverbrauch", note: "Noch keine Messquelle zugeordnet" };
}

export function meterRoomId(m: EnergyMeter, project: Project): string | null {
  if (m.roomId) return m.roomId;
  if (m.itemId) {
    const it = project.items.find((i) => i.id === m.itemId);
    if (it) return itemRoom(it, project)?.id ?? null;
  }
  return null;
}

export interface RoomAggregate {
  roomId: string;
  value: number | null;
  /** true = ein Raumzähler misst den gesamten Raum */
  complete: boolean;
  meterIds: string[];
  missing: number;
  /** Geräte im Raum mit Gerätezuordnung, aber ohne Messpunkt */
  unmeteredDevices: number;
  meteredDevices: number;
}

export function roomAggregates(project: Project, values: Values): RoomAggregate[] {
  const meters = project.meters.filter(isConsumer);
  const out: RoomAggregate[] = [];
  for (const room of project.rooms) {
    const inRoom = meters.filter((m) => !m.isHouseMain && meterRoomId(m, project) === room.id);
    const whole = inRoom.find((m) => m.coversWholeRoom && m.roomId === room.id);
    // Nur Messpunkte, deren übergeordnete Zähler NICHT ebenfalls in diesem Raum liegen
    const ids = new Set(inRoom.map((m) => m.id));
    const tops = whole ? [whole] : inRoom.filter((m) => !ancestors(meters, m).some((a) => ids.has(a.id)));
    let value = 0;
    let measured = 0;
    let missing = 0;
    for (const m of tops) {
      if (!has(values, m.id)) continue;
      const v = values.get(m.id);
      if (v === null || v === undefined) missing++;
      else {
        value += v;
        measured++;
      }
    }
    const itemIdsInRoom = new Set(project.items.filter((i) => itemRoom(i, project)?.id === room.id).map((i) => i.id));
    const meteredItems = new Set(inRoom.map((m) => m.itemId).filter(Boolean));
    const devices = project.bindings.filter(
      (b) => b.target.kind === "item" && itemIdsInRoom.has(b.target.id) && ["light", "switch", "climate"].includes(b.role),
    );
    const deviceItems = new Set(devices.map((b) => b.target.id));
    const metered = [...deviceItems].filter((id) => meteredItems.has(id)).length;
    if (!tops.length && !deviceItems.size) continue;
    out.push({
      roomId: room.id,
      value: measured ? value : null,
      complete: !!whole,
      meterIds: tops.map((m) => m.id),
      missing,
      unmeteredDevices: deviceItems.size - metered,
      meteredDevices: metered,
    });
  }
  return out;
}

/** Blätter der Hierarchie (ohne Hauszähler) – Grundlage für „höchster Verbrauch“. */
export function leafConsumers(meters: EnergyMeter[]): EnergyMeter[] {
  return meters.filter((m) => isConsumer(m) && !m.isHouseMain && childrenOf(meters, m.id).length === 0);
}
