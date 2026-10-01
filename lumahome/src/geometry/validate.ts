// Projektweite Prüfung: ungültige Polygone, unmögliche Maße, Öffnungen
// außerhalb von Wänden und problematische Platzierungen.
import type { Project, Selection } from "@/model/types";
import { edgeByStart, pointInPolygon, polygonProblems, polygonsOverlap } from "./polygon";
import { placementIssues } from "./placement";
import { buildWalls } from "./walls";

export interface Issue {
  key: string;
  severity: "error" | "warning";
  message: string;
  target: Selection;
  floorId: string;
  /** Mögliche Korrekturaktion */
  fix?: "fit-opening" | "pull-inside" | "accept-placement";
  code?: string;
}

export function openingProblems(project: Project, openingId: string): string[] {
  const o = project.openings.find((x) => x.id === openingId);
  if (!o) return [];
  const room = project.rooms.find((r) => r.id === o.roomId);
  if (!room) return ["Der zugehörige Raum fehlt."];
  const floor = project.floors.find((f) => f.id === room.floorId);
  const edge = edgeByStart(room, o.edgeStart);
  if (!edge) return ["Die zugehörige Wand fehlt."];
  const out: string[] = [];
  const margin = 0.05;
  if (o.offset - o.width / 2 < margin - 1e-6 || o.offset + o.width / 2 > edge.length - margin + 1e-6) {
    out.push(`Liegt außerhalb der Wand (Wandlänge ${edge.length.toFixed(2)} m, Öffnung ${o.width.toFixed(2)} m).`);
  }
  const sill = o.kind === "window" ? o.sill : 0;
  if (floor && sill + o.height > floor.height + 1e-6) out.push("Ist höher als die Raumhöhe.");
  if (room.openEdges.includes(o.edgeStart) && o.kind !== "passage") out.push("Sitzt an einer Kante ohne Wand.");
  for (const other of project.openings) {
    if (other.id === o.id || other.roomId !== o.roomId || other.edgeStart !== o.edgeStart) continue;
    if (Math.abs(other.offset - o.offset) < (other.width + o.width) / 2 - 1e-6) {
      out.push("Überschneidet sich mit einer anderen Öffnung.");
      break;
    }
  }
  return out;
}

export function validateProject(project: Project): Issue[] {
  const issues: Issue[] = [];
  for (const room of project.rooms) {
    for (const msg of polygonProblems(room.vertices)) {
      issues.push({ key: `room:${room.id}:${msg}`, severity: "error", message: `${room.name}: ${msg}`, target: { kind: "room", id: room.id }, floorId: room.floorId });
    }
  }
  for (const f of project.floors) {
    const rooms = project.rooms.filter((r) => r.floorId === f.id);
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        if (polygonsOverlap(rooms[i].vertices, rooms[j].vertices)) {
          issues.push({
            key: `overlap:${rooms[i].id}:${rooms[j].id}`,
            severity: "warning",
            message: `${rooms[i].name} und ${rooms[j].name} überlappen sich.`,
            target: { kind: "room", id: rooms[j].id },
            floorId: f.id,
          });
        }
      }
    }
  }
  for (const o of project.openings) {
    const room = project.rooms.find((r) => r.id === o.roomId);
    for (const msg of openingProblems(project, o.id)) {
      const label = o.kind === "door" ? "Tür" : o.kind === "window" ? "Fenster" : "Durchgang";
      issues.push({
        key: `opening:${o.id}:${msg}`,
        severity: msg.startsWith("Sitzt") ? "warning" : "error",
        message: `${label} in ${room?.name ?? "?"}: ${msg}`,
        target: { kind: "opening", id: o.id },
        floorId: room?.floorId ?? "",
        fix: msg.startsWith("Liegt außerhalb") ? "fit-opening" : undefined,
      });
    }
  }
  for (const v of project.voids) {
    const rooms = project.rooms.filter((r) => r.floorId === v.floorId);
    const center = { x: v.x + v.width / 2, y: v.y + v.depth / 2 };
    if (!rooms.some((r) => pointInPolygon(center, r.vertices))) {
      issues.push({ key: `void:${v.id}`, severity: "warning", message: `${v.name}: liegt außerhalb aller Räume.`, target: { kind: "void", id: v.id }, floorId: v.floorId });
    }
  }
  const wallCache = new Map(project.floors.map((f) => [f.id, buildWalls(project, f)]));
  for (const it of project.items) {
    for (const pi of placementIssues(it, project, wallCache.get(it.floorId))) {
      issues.push({
        key: `item:${it.id}:${pi.code}`,
        severity: "warning",
        message: `${it.name}: ${pi.message}`,
        target: { kind: "item", id: it.id },
        floorId: it.floorId,
        fix: pi.code === "outside" ? "pull-inside" : "accept-placement",
        code: pi.code,
      });
    }
  }
  return issues;
}
