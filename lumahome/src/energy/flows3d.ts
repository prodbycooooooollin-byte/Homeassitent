// Ermittelt die im Modell darzustellenden Stromflüsse aus Live-Messwerten.
// Physikalisch messbar ist der Austausch jedes Messpunkts mit dem Hausnetz –
// daher laufen alle Flüsse über den Verteiler (Zählerschrank). Eine direkte
// Zuordnung „Akku → bestimmtes Gerät“ wird bewusst nicht behauptet.
import type { EnergyMeter, Project } from "@/model/types";
import type { HaState } from "@/devices/ha-types";
import { numericState } from "@/devices/state";
import { entryFor } from "@/catalog/catalog";
import { centroid, polygonArea } from "@/geometry/polygon";
import { childrenOf } from "./aggregate";
import { livePower } from "./live";

export type FlowKind = "pv" | "battery" | "grid" | "consumer";

export interface Flow {
  key: string;
  kind: FlowKind;
  /** Weltpunkte (x, y, z) entlang des Kabels in Flussrichtung */
  path: [number, number, number][];
  watts: number;
  label: string;
  meterId: string | null;
}

export interface FlowNodes {
  hub: [number, number, number];
  hubFloorId: string;
  pv: { point: [number, number, number]; watts: number | null } | null;
  grid: { point: [number, number, number]; watts: number | null } | null;
  batteries: { meter: EnergyMeter; point: [number, number, number]; watts: number | null; soc: number | null }[];
}

type P = [number, number, number];

function itemTop(project: Project, itemId: string | null, dy = 0): P | null {
  const it = itemId ? project.items.find((i) => i.id === itemId) : undefined;
  const f = it && project.floors.find((x) => x.id === it.floorId);
  if (!it || !f) return null;
  return [it.x, f.elevation + it.elevation + it.height + dy, it.y];
}

function cableHeight(project: Project, floorId: string) {
  const f = project.floors.find((x) => x.id === floorId);
  return (f?.elevation ?? 0) + Math.min(2.2, (f?.height ?? 2.6) - 0.3);
}

/** Rechtwinkliger Kabelweg: hoch auf Kabelhöhe, waagerecht (x, dann z), hinunter. */
export function route(a: P, b: P, height: number): P[] {
  const pts: P[] = [a, [a[0], height, a[2]], [b[0], height, a[2]], [b[0], height, b[2]], b];
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) > 0.01);
}

export function hubLocation(project: Project): { point: P; floorId: string } {
  const fuse = project.items.find((i) => i.catalogId === "fuse-box");
  const main = project.meters.find((m) => m.isHouseMain && m.itemId);
  const anchor = fuse ?? (main ? project.items.find((i) => i.id === main.itemId) : undefined);
  if (anchor) {
    const f = project.floors.find((x) => x.id === anchor.floorId)!;
    return { point: [anchor.x, f.elevation + anchor.elevation + anchor.height / 2, anchor.y], floorId: anchor.floorId };
  }
  const lowest = [...project.floors].sort((a, b) => a.elevation - b.elevation)[0];
  const rooms = project.rooms.filter((r) => r.floorId === lowest?.id && !r.outdoor).sort((a, b) => polygonArea(b.vertices) - polygonArea(a.vertices));
  const c = rooms[0] ? centroid(rooms[0].vertices) : { x: 0, y: 0 };
  return { point: [c.x, (lowest?.elevation ?? 0) + 1, c.y], floorId: lowest?.id ?? "" };
}

/** Mittelpunkt des Dachs (für PV ohne eigenes Modulfeld). */
export function roofCenter(project: Project): P | null {
  const top = [...project.floors].sort((a, b) => b.elevation - a.elevation)[0];
  const rooms = project.rooms.filter((r) => r.floorId === top?.id && !r.outdoor);
  if (!top || !rooms.length) return null;
  const c = centroid(rooms.flatMap((r) => r.vertices));
  return [c.x, top.elevation + top.height + 0.35, c.y];
}

export function computeFlows(project: Project, states: Record<string, HaState>, connected: boolean, minWatts = 5): { flows: Flow[]; nodes: FlowNodes } {
  const { point: hub, floorId } = hubLocation(project);
  const h = cableHeight(project, floorId);
  const flows: Flow[] = [];
  const w = (m: EnergyMeter) => livePower(m, states, connected)?.watts ?? null;

  // PV
  const pvMeters = project.meters.filter((m) => m.flow === "pv_production");
  let pvNode: FlowNodes["pv"] = null;
  if (pvMeters.length) {
    const watts = pvMeters.reduce<number | null>((s, m) => (s === null || w(m) === null ? null : s + (w(m) as number)), 0);
    const pt = itemTop(project, pvMeters.find((m) => m.itemId)?.itemId ?? null, 0.05) ?? roofCenter(project);
    if (pt) {
      pvNode = { point: pt, watts };
      if (watts !== null && watts > minWatts) flows.push({ key: "pv", kind: "pv", path: [pt, [pt[0], h, pt[2]], [hub[0], h, pt[2]], [hub[0], h, hub[2]], hub], watts, label: "PV", meterId: pvMeters[0].id });
    }
  }

  // Netz: Hausanschluss am nächstgelegenen Rand außerhalb des Hauses
  const gridMeters = project.meters.filter((m) => m.flow.startsWith("grid_"));
  let gridNode: FlowNodes["grid"] = null;
  if (gridMeters.length) {
    const xs = project.rooms.filter((r) => !r.outdoor).flatMap((r) => r.vertices.map((v) => v.x));
    const ys = project.rooms.filter((r) => !r.outdoor).flatMap((r) => r.vertices.map((v) => v.y));
    const maxX = Math.max(...xs, hub[0]);
    const pt: P = [maxX + 1.6, 0.4, Math.min(Math.max(hub[2], Math.min(...ys)), Math.max(...ys))];
    let net: number | null = 0;
    for (const m of gridMeters) {
      const v = w(m);
      if (!m.powerEntityId) continue;
      if (v === null) net = null;
      else if (net !== null) net += m.flow === "grid_export" ? -v : v;
    }
    gridNode = { point: pt, watts: net };
    if (net !== null && Math.abs(net) > minWatts) {
      const path = route(pt, hub, h);
      flows.push({ key: "grid", kind: "grid", path: net > 0 ? path : [...path].reverse(), watts: Math.abs(net), label: net > 0 ? "Netzbezug" : "Einspeisung", meterId: gridMeters[0].id });
    }
  }

  // Speicher
  const batteries: FlowNodes["batteries"] = [];
  for (const m of project.meters.filter((x) => x.flow.startsWith("battery_"))) {
    const pt = itemTop(project, m.itemId, -0.2);
    let v = w(m);
    if (v !== null && m.flow === "battery_charge") v = -v;
    const socState = m.socEntityId ? states[m.socEntityId] : undefined;
    batteries.push({ meter: m, point: pt ?? hub, watts: v, soc: numericState(socState) });
    if (!pt || v === null || Math.abs(v) <= minWatts) continue;
    const path = route(hub, pt, h);
    flows.push({ key: `bat:${m.id}`, kind: "battery", path: v > 0 ? [...path].reverse() : path, watts: Math.abs(v), label: v > 0 ? "entlädt" : "lädt", meterId: m.id });
  }

  // Verbraucher: Messpunkte ohne Unterzähler, mit Objekt im Haus
  for (const m of project.meters) {
    if (m.flow !== "consumption" || m.isHouseMain || !m.itemId) continue;
    if (childrenOf(project.meters, m.id).length) continue;
    const it = project.items.find((i) => i.id === m.itemId);
    if (!it) continue;
    const v = w(m);
    if (v === null || v <= minWatts) continue;
    const f = project.floors.find((x) => x.id === it.floorId)!;
    const e = entryFor(it.catalogId);
    const target: P = [it.x, f.elevation + it.elevation + Math.min(it.height, 1.2) * (e.mount === "ceiling" ? 0 : 0.8), it.y];
    const viaHeight = it.floorId === floorId ? h : cableHeight(project, it.floorId);
    const path: P[] = it.floorId === floorId ? route(hub, target, h) : [hub, [hub[0], viaHeight, hub[2]], [target[0], viaHeight, hub[2]], [target[0], viaHeight, target[2]], target];
    flows.push({ key: `use:${m.id}`, kind: "consumer", path, watts: v, label: m.label, meterId: m.id });
  }
  return { flows, nodes: { hub, hubFloorId: floorId, pv: pvNode, grid: gridNode, batteries } };
}
