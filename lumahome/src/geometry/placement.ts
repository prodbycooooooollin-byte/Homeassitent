// Platzierung von Möbeln und Geräten: Grundflächen, Kollisionen, Einrasten.
import type { Floor, Item, Project, Room, Vec2 } from "@/model/types";
import { entryFor } from "@/catalog/catalog";
import { pointInPolygon, polygonArea } from "./polygon";
import { buildWalls, placeOpening, wallRect, type WallSegment } from "./walls";
import { add, closestOnSegment, dot, rotate, scale, sub } from "./vec";

/** Lokales Koordinatensystem: Breite entlang x, Tiefe entlang y; Vorderseite zeigt nach +y. */
export function itemCorners(it: Pick<Item, "x" | "y" | "width" | "depth" | "rotation">): Vec2[] {
  const hw = it.width / 2;
  const hd = it.depth / 2;
  const c = { x: it.x, y: it.y };
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((p) => add(c, rotate(p, it.rotation)));
}

export function worldToItemLocal(it: Pick<Item, "x" | "y" | "rotation">, p: Vec2): Vec2 {
  return rotate(sub(p, { x: it.x, y: it.y }), -it.rotation);
}

function axesOf(poly: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const e = sub(poly[(i + 1) % poly.length], poly[i]);
    const l = Math.hypot(e.x, e.y) || 1;
    out.push({ x: -e.y / l, y: e.x / l });
  }
  return out;
}

/** Überlappung zweier konvexer Polygone (SAT). margin > 0 verlangt echte Durchdringung. */
export function convexOverlap(a: Vec2[], b: Vec2[], margin = 0.01): boolean {
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const p of a) {
      const d = dot(p, axis);
      minA = Math.min(minA, d);
      maxA = Math.max(maxA, d);
    }
    for (const p of b) {
      const d = dot(p, axis);
      minB = Math.min(minB, d);
      maxB = Math.max(maxB, d);
    }
    if (maxA - margin <= minB || maxB - margin <= minA) return false;
  }
  return true;
}

export function roomAt(p: Vec2, rooms: Room[]): Room | null {
  // Bei verschachtelten Polygonen gewinnt der kleinste Raum
  const hits = rooms.filter((r) => pointInPolygon(p, r.vertices));
  if (!hits.length) return null;
  return hits.sort((a, b) => polygonArea(a.vertices) - polygonArea(b.vertices))[0];
}

export function itemRoom(item: Item, project: Pick<Project, "rooms">): Room | null {
  return roomAt({ x: item.x, y: item.y }, project.rooms.filter((r) => r.floorId === item.floorId));
}

export type IssueCode = "outside" | "wall" | "overlap" | "door" | "ceiling";

export interface PlacementIssue {
  code: IssueCode;
  message: string;
  otherId?: string;
}

/** Ermittelt problematische Platzierungen eines Objekts. */
export function placementIssues(item: Item, project: Project, walls?: WallSegment[]): PlacementIssue[] {
  const floor = project.floors.find((f) => f.id === item.floorId);
  if (!floor) return [];
  const entry = entryFor(item.catalogId);
  const issues: PlacementIssue[] = [];
  const corners = itemCorners(item);
  const rooms = project.rooms.filter((r) => r.floorId === item.floorId);
  const room = roomAt({ x: item.x, y: item.y }, rooms);
  if (!room && entry.mount !== "roof") issues.push({ code: "outside", message: "Liegt außerhalb aller Räume." });

  if (!entry.throughCeiling && item.elevation + item.height > floor.height + 0.01) {
    issues.push({ code: "ceiling", message: "Ragt über die Raumhöhe hinaus." });
  }

  const ws = walls ?? buildWalls(project, floor);
  if (entry.mount !== "wall" && entry.mount !== "roof") {
    for (const w of ws) {
      // Nur Wandstücke berücksichtigen, die in der Höhe des Objekts tatsächlich Wand sind
      if (!convexOverlap(corners, wallRect(w), 0.02)) continue;
      const blocked = wallBlocksHeight(w, corners, item.elevation, item.elevation + item.height);
      if (blocked) {
        issues.push({ code: "wall", message: "Steht in einer Wand." });
        break;
      }
    }
  }

  if (entry.mount === "floor") {
    for (const other of project.items) {
      if (other.id === item.id || other.floorId !== item.floorId) continue;
      const oe = entryFor(other.catalogId);
      if (oe.mount !== "floor" || other.catalogId === "rug" || item.catalogId === "rug") continue;
      if (convexOverlap(corners, itemCorners(other), 0.03)) {
        issues.push({ code: "overlap", message: `Überschneidet sich mit „${other.name}“.`, otherId: other.id });
        break;
      }
    }
    // Schwenkbereich von Türen freihalten
    for (const o of project.openings) {
      if (o.kind !== "door") continue;
      const pl = placeOpening(o, rooms);
      if (!pl) continue;
      const swing = doorSwingArea(pl.a, pl.b, pl.edge.inward);
      if (convexOverlap(corners, swing, 0.03) && item.catalogId !== "rug") {
        issues.push({ code: "door", message: "Blockiert den Schwenkbereich einer Tür." });
        break;
      }
    }
  }
  return issues.filter((i) => !item.acceptedIssues.includes(i.code));
}

function wallBlocksHeight(w: WallSegment, corners: Vec2[], y0: number, y1: number): boolean {
  // Liegt das Objekt vollständig innerhalb einer Öffnung (z. B. Tür), zählt es nicht als Kollision
  for (const cut of w.cuts) {
    const s = corners.map((p) => dot(sub(p, w.a), w.dir));
    const inside = Math.min(...s) >= cut.from - 0.01 && Math.max(...s) <= cut.to + 0.01;
    if (inside && y0 >= cut.sill - 0.01 && y1 <= cut.top + 0.01) return false;
  }
  return true;
}

export function doorSwingArea(a: Vec2, b: Vec2, inward: Vec2): Vec2[] {
  const w = Math.hypot(b.x - a.x, b.y - a.y);
  return [a, b, add(b, scale(inward, w)), add(a, scale(inward, w))];
}

export interface WallSnap {
  x: number;
  y: number;
  rotation: number;
  wallKey: string;
}

/**
 * Rastet ein Objekt mit der Rückseite an die nächste Wand, wenn es näher als
 * `threshold` ist. Die Vorderseite zeigt danach in den Raum.
 */
export function snapToWall(
  item: Pick<Item, "x" | "y" | "depth" | "rotation">,
  walls: WallSegment[],
  roomId: string | null,
  rooms: Room[],
  threshold = 0.35,
): WallSnap | null {
  let best: { d: number; snap: WallSnap } | null = null;
  const p = { x: item.x, y: item.y };
  for (const w of walls) {
    const c = closestOnSegment(p, w.a, w.b);
    if (c.distance > threshold + item.depth / 2 + w.thickness / 2) continue;
    // Normale in Richtung des Objekts
    let n = { x: -w.dir.y, y: w.dir.x };
    if (dot(sub(p, c.point), n) < 0) n = { x: -n.x, y: n.y * -1 };
    const center = add(c.point, scale(n, w.thickness / 2 + item.depth / 2 + 0.005));
    // Nur Wände des eigenen Raums berücksichtigen
    if (roomId) {
      const r = rooms.find((x) => x.id === roomId);
      if (r && !pointInPolygon(center, r.vertices)) continue;
    }
    const gap = Math.abs(dot(sub(p, c.point), n)) - w.thickness / 2 - item.depth / 2;
    if (gap > threshold) continue;
    const rotation = Math.atan2(-n.x, n.y);
    if (!best || c.distance < best.d) best = { d: c.distance, snap: { x: center.x, y: center.y, rotation, wallKey: w.key } };
  }
  return best?.snap ?? null;
}

/** Höhe, auf der ein Objekt mit Montageart „surface“ steht (Oberkante darunterliegender Möbel). */
export function surfaceElevation(item: Pick<Item, "id" | "x" | "y" | "floorId">, items: Item[]): number {
  let top = 0;
  for (const other of items) {
    if (other.id === item.id || other.floorId !== item.floorId) continue;
    const e = entryFor(other.catalogId);
    if (e.surfaceAt === undefined) continue;
    const local = worldToItemLocal(other, { x: item.x, y: item.y });
    if (Math.abs(local.x) <= other.width / 2 && Math.abs(local.y) <= other.depth / 2) {
      top = Math.max(top, other.elevation + other.height * e.surfaceAt);
    }
  }
  return top;
}

/** Standard-Höhe je Montageart. */
export function defaultElevation(mount: string, height: number, floor: Floor): number {
  if (mount === "ceiling") return Math.max(0, floor.height - height);
  if (mount === "roof") return floor.height + 0.27;
  if (mount === "wall") return Math.min(Math.max(0, floor.height - height - 0.2), height < 0.15 ? 0.3 : 1.4);
  return 0;
}

export const snapAngle = (a: number, step = Math.PI / 12) => Math.round(a / step) * step;

/** Schiebt einen Punkt in ein Polygon hinein (für „In den Raum holen“). */
export function pullInside(p: Vec2, room: Room, margin = 0.3): Vec2 {
  if (pointInPolygon(p, room.vertices, true)) return p;
  let best = p;
  let bestD = Infinity;
  const pts = room.vertices;
  for (let i = 0; i < pts.length; i++) {
    const c = closestOnSegment(p, pts[i], pts[(i + 1) % pts.length]);
    if (c.distance < bestD) {
      bestD = c.distance;
      best = c.point;
    }
  }
  // Etwas nach innen in Richtung Schwerpunkt verschieben
  const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
  const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
  const dir = { x: cx - best.x, y: cy - best.y };
  const l = Math.hypot(dir.x, dir.y) || 1;
  return { x: best.x + (dir.x / l) * margin, y: best.y + (dir.y / l) * margin };
}
