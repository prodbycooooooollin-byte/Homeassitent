// Weltposition eines Ziels für am Objekt verankerte Karten und Beschriftungen.
import type { Project } from "@/model/types";
import type { CardTarget } from "@/store/ui";
import { centroid } from "@/geometry/polygon";
import { placeOpening } from "@/geometry/walls";

export function anchorOf(project: Project, target: NonNullable<CardTarget>): [number, number, number] | null {
  if (target.kind === "item") {
    const it = project.items.find((i) => i.id === target.id);
    const f = it && project.floors.find((x) => x.id === it.floorId);
    if (!it || !f) return null;
    return [it.x, f.elevation + it.elevation + it.height, it.y];
  }
  if (target.kind === "opening") {
    const o = project.openings.find((x) => x.id === target.id);
    const room = o && project.rooms.find((r) => r.id === o.roomId);
    const f = room && project.floors.find((x) => x.id === room.floorId);
    const pl = o && placeOpening(o, project.rooms);
    if (!o || !f || !pl) return null;
    return [pl.center.x, f.elevation + o.sill + Math.min(o.height, 1.2), pl.center.y];
  }
  const r = project.rooms.find((x) => x.id === target.id);
  const f = r && project.floors.find((x) => x.id === r.floorId);
  if (!r || !f) return null;
  const c = centroid(r.vertices);
  return [c.x, f.elevation + 1.0, c.y];
}
