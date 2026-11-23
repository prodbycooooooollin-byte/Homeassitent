// Platzieren neuer Katalogobjekte mit sinnvoll begrenztem Einrasten.
import type { Id, Item, Project, Vec2 } from "@/model/types";
import { entryFor } from "@/catalog/catalog";
import { newId } from "@/model/ids";
import { defaultElevation, roomAt, snapToWall, surfaceElevation } from "@/geometry/placement";
import { buildWalls } from "@/geometry/walls";
import { roundMm } from "@/geometry/vec";
import { centroid } from "@/geometry/polygon";

export interface PlacementPreview {
  item: Item;
  snapped: "wall" | "surface" | "ceiling" | "floor";
  roomName: string | null;
}

export function previewPlacement(project: Project, floorId: Id, catalogId: string, at: Vec2, rotation: number, snap = true): PlacementPreview {
  const e = entryFor(catalogId);
  const floor = project.floors.find((f) => f.id === floorId)!;
  const rooms = project.rooms.filter((r) => r.floorId === floorId);
  const room = roomAt(at, rooms);
  let item: Item = {
    id: newId("item"),
    floorId,
    catalogId,
    name: e.name,
    x: roundMm(at.x),
    y: roundMm(at.y),
    elevation: defaultElevation(e.mount, e.size.h, floor),
    rotation,
    width: e.size.w,
    depth: e.size.d,
    height: e.size.h,
    material: e.defaultMaterial,
    color: e.defaultColor,
    acceptedIssues: [],
  };
  let snapped: PlacementPreview["snapped"] = e.mount === "ceiling" ? "ceiling" : "floor";
  if (snap) {
    if (e.mount === "wall" || e.mount === "floor") {
      const walls = buildWalls(project, floor);
      const s = snapToWall(item, walls, room?.id ?? null, rooms, e.mount === "wall" ? 0.6 : 0.25);
      if (s) {
        item = { ...item, x: roundMm(s.x), y: roundMm(s.y), rotation: s.rotation };
        snapped = "wall";
      }
    }
    if (e.mount === "surface") {
      const el = surfaceElevation(item, project.items);
      item = { ...item, elevation: roundMm(el) };
      if (el > 0) snapped = "surface";
    }
  }
  return { item, snapped, roomName: room?.name ?? null };
}

/** Standardposition ohne Ziehen: Mitte des gewählten Raums bzw. der Etage. */
export function defaultDropPoint(project: Project, floorId: Id, roomId: Id | null): Vec2 {
  const room = (roomId && project.rooms.find((r) => r.id === roomId && r.floorId === floorId)) || project.rooms.find((r) => r.floorId === floorId);
  if (room) return centroid(room.vertices);
  return { x: 2, y: 2 };
}
