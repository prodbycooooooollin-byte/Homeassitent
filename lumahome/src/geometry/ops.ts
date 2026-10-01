// Reine Änderungsfunktionen am Projekt. Sie liefern immer ein neues Objekt
// zurück (unveränderliche Daten → einfaches Rückgängig/Wiederholen).
//
// Regeln beim Verändern und Löschen von Räumen (siehe docs/ARCHITEKTUR.md):
// - Verkleinern/Verschieben: Möbel und Geräte bleiben an ihrer Position. Liegt
//   ein Objekt danach außerhalb aller Räume, wird es als Hinweis markiert und
//   kann mit „In den Raum holen“ bewusst verschoben werden. Zuordnungen bleiben.
// - Öffnungen behalten ihren Abstand zum Wandanfang; passen sie nicht mehr auf
//   die Wand, werden sie als Fehler markiert („Auf Wand einpassen“).
// - Löschen: Der Benutzer entscheidet ausdrücklich, ob enthaltene Objekte
//   mitgelöscht oder ohne Raum auf der Etage behalten werden. Öffnungen des
//   Raums und Raum-Zuordnungen (z. B. Raumklima) werden entfernt; Messpunkte
//   verlieren nur den Raumbezug.
import type { Floor, FloorMaterial, Id, Item, Opening, Project, Room, Vec2, Vertex } from "@/model/types";
import { newId } from "@/model/ids";
import { edgeByStart, roomEdges } from "./polygon";
import { pointInPolygon } from "./polygon";
import { add, dot, roundMm, scale, sub } from "./vec";

const LINK_TOL = 0.002;

export function touch(p: Project): Project {
  return { ...p, updatedAt: new Date().toISOString() };
}

export function rectVertices(x: number, y: number, w: number, d: number): Vertex[] {
  return [
    { id: newId("v"), x: roundMm(x), y: roundMm(y) },
    { id: newId("v"), x: roundMm(x + w), y: roundMm(y) },
    { id: newId("v"), x: roundMm(x + w), y: roundMm(y + d) },
    { id: newId("v"), x: roundMm(x), y: roundMm(y + d) },
  ];
}

export function makeRoom(floorId: Id, name: string, vertices: Vertex[], floorMaterial: FloorMaterial = "oak"): Room {
  return { id: newId("room"), floorId, name, vertices, floorMaterial, wallColor: "#F2EFE8", openEdges: [] };
}

export function addRoom(p: Project, room: Room): Project {
  return { ...p, rooms: [...p.rooms, room] };
}

export function updateRoom(p: Project, id: Id, patch: Partial<Room>): Project {
  return { ...p, rooms: p.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

/**
 * Verschiebt Ecken. Mit linked=true werden deckungsgleiche Ecken anderer Räume
 * derselben Etage mitbewegt, damit gemeinsame Wände zusammenbleiben.
 */
export function moveVertices(p: Project, roomId: Id, moves: { id: Id; to: Vec2 }[], linked = true): Project {
  const room = p.rooms.find((r) => r.id === roomId);
  if (!room) return p;
  const origin = new Map(room.vertices.map((v) => [v.id, v]));
  const shifts = moves
    .map((m) => ({ from: origin.get(m.id)!, to: { x: roundMm(m.to.x), y: roundMm(m.to.y) }, id: m.id }))
    .filter((m) => m.from);
  return {
    ...p,
    rooms: p.rooms.map((r) => {
      if (r.floorId !== room.floorId) return r;
      if (r.id !== roomId && !linked) return r;
      let changed = false;
      const vertices = r.vertices.map((v) => {
        for (const s of shifts) {
          const hit = r.id === roomId ? v.id === s.id : Math.abs(v.x - s.from.x) < LINK_TOL && Math.abs(v.y - s.from.y) < LINK_TOL;
          if (hit) {
            changed = true;
            return { ...v, x: s.to.x, y: s.to.y };
          }
        }
        return v;
      });
      return changed ? { ...r, vertices } : r;
    }),
  };
}

export function moveEdge(p: Project, roomId: Id, edgeStart: Id, delta: Vec2, linked = true): Project {
  const room = p.rooms.find((r) => r.id === roomId);
  const e = room && edgeByStart(room, edgeStart);
  if (!room || !e) return p;
  return moveVertices(p, roomId, [
    { id: e.startId, to: add(e.a, delta) },
    { id: e.endId, to: add(e.b, delta) },
  ], linked);
}

/** Setzt die Länge einer Wand, indem der Endpunkt entlang der Wandrichtung verschoben wird. */
export function setEdgeLength(p: Project, roomId: Id, edgeStart: Id, length: number): Project {
  const room = p.rooms.find((r) => r.id === roomId);
  const e = room && edgeByStart(room, edgeStart);
  if (!room || !e || length < 0.2) return p;
  return moveVertices(p, roomId, [{ id: e.endId, to: add(e.a, scale(e.dir, length)) }]);
}

/** Setzt Breite und Tiefe eines achsparallelen Rechteckraums (rechte und untere Wand werden verschoben). */
export function resizeRectRoom(p: Project, roomId: Id, width: number, depth: number): Project {
  const room = p.rooms.find((r) => r.id === roomId);
  if (!room) return p;
  const minX = Math.min(...room.vertices.map((v) => v.x));
  const minY = Math.min(...room.vertices.map((v) => v.y));
  const maxX = Math.max(...room.vertices.map((v) => v.x));
  const maxY = Math.max(...room.vertices.map((v) => v.y));
  const moves = room.vertices.map((v) => ({
    id: v.id,
    to: {
      x: Math.abs(v.x - maxX) < 1e-6 ? minX + width : v.x,
      y: Math.abs(v.y - maxY) < 1e-6 ? minY + depth : v.y,
    },
  }));
  return moveVertices(p, roomId, moves);
}

export function translateRoom(p: Project, roomId: Id, delta: Vec2, withContents = true): Project {
  const room = p.rooms.find((r) => r.id === roomId);
  if (!room) return p;
  const contained = new Set(
    withContents ? p.items.filter((i) => i.floorId === room.floorId && pointInPolygon({ x: i.x, y: i.y }, room.vertices)).map((i) => i.id) : [],
  );
  return {
    ...p,
    rooms: p.rooms.map((r) =>
      r.id === roomId ? { ...r, vertices: r.vertices.map((v) => ({ ...v, x: roundMm(v.x + delta.x), y: roundMm(v.y + delta.y) })) } : r,
    ),
    items: p.items.map((i) => (contained.has(i.id) ? { ...i, x: roundMm(i.x + delta.x), y: roundMm(i.y + delta.y) } : i)),
  };
}

/** Fügt eine Ecke auf einer Kante ein; Öffnungen hinter dem Teilungspunkt wandern auf die neue Kante. */
export function insertVertex(p: Project, roomId: Id, edgeStart: Id, at: Vec2): { project: Project; vertexId: Id } {
  const room = p.rooms.find((r) => r.id === roomId);
  const e = room && edgeByStart(room, edgeStart);
  if (!room || !e) return { project: p, vertexId: "" };
  const s = Math.max(0.1, Math.min(e.length - 0.1, dot(sub(at, e.a), e.dir)));
  const pos = add(e.a, scale(e.dir, s));
  const nv: Vertex = { id: newId("v"), x: roundMm(pos.x), y: roundMm(pos.y) };
  const vertices = [...room.vertices];
  vertices.splice(e.index + 1, 0, nv);
  const openings = p.openings.map((o) =>
    o.roomId === roomId && o.edgeStart === edgeStart && o.offset > s ? { ...o, edgeStart: nv.id, offset: roundMm(o.offset - s) } : o,
  );
  return { project: { ...p, rooms: p.rooms.map((r) => (r.id === roomId ? { ...r, vertices } : r)), openings }, vertexId: nv.id };
}

/** Entfernt eine Ecke (mind. drei bleiben). Öffnungen der beiden Kanten werden auf die neue Kante projiziert. */
export function removeVertex(p: Project, roomId: Id, vertexId: Id): Project {
  const room = p.rooms.find((r) => r.id === roomId);
  if (!room || room.vertices.length <= 3) return p;
  const idx = room.vertices.findIndex((v) => v.id === vertexId);
  if (idx < 0) return p;
  const prev = room.vertices[(idx - 1 + room.vertices.length) % room.vertices.length];
  const edges = roomEdges(room);
  const vertices = room.vertices.filter((v) => v.id !== vertexId);
  const newRoom = { ...room, vertices, openEdges: room.openEdges.filter((x) => x !== vertexId) };
  const ne = edgeByStart(newRoom, prev.id)!;
  const openings = p.openings.map((o) => {
    if (o.roomId !== roomId || (o.edgeStart !== vertexId && o.edgeStart !== prev.id)) return o;
    const oe = edges.find((x) => x.startId === o.edgeStart)!;
    const world = add(oe.a, scale(oe.dir, o.offset));
    return { ...o, edgeStart: prev.id, offset: roundMm(dot(sub(world, ne.a), ne.dir)) };
  });
  return { ...p, rooms: p.rooms.map((r) => (r.id === roomId ? newRoom : r)), openings };
}

export interface RoomDeletionSummary {
  items: Item[];
  openings: Opening[];
  bindings: number;
  meters: number;
}

export function roomDeletionSummary(p: Project, roomId: Id): RoomDeletionSummary {
  const room = p.rooms.find((r) => r.id === roomId);
  if (!room) return { items: [], openings: [], bindings: 0, meters: 0 };
  const items = p.items.filter((i) => i.floorId === room.floorId && pointInPolygon({ x: i.x, y: i.y }, room.vertices));
  const openings = p.openings.filter((o) => o.roomId === roomId);
  const itemIds = new Set(items.map((i) => i.id));
  const openingIds = new Set(openings.map((o) => o.id));
  const bindings = p.bindings.filter(
    (b) => (b.target.kind === "room" && b.target.id === roomId) || (b.target.kind === "opening" && openingIds.has(b.target.id)) || (b.target.kind === "item" && itemIds.has(b.target.id)),
  ).length;
  const meters = p.meters.filter((m) => m.roomId === roomId).length;
  return { items, openings, bindings, meters };
}

export function deleteRoom(p: Project, roomId: Id, deleteContents: boolean): Project {
  const summary = roomDeletionSummary(p, roomId);
  const openingIds = new Set(summary.openings.map((o) => o.id));
  const removedItems = new Set(deleteContents ? summary.items.map((i) => i.id) : []);
  return {
    ...p,
    rooms: p.rooms.filter((r) => r.id !== roomId),
    openings: p.openings.filter((o) => !openingIds.has(o.id)),
    items: p.items.filter((i) => !removedItems.has(i.id)),
    bindings: p.bindings.filter(
      (b) =>
        !(b.target.kind === "room" && b.target.id === roomId) &&
        !(b.target.kind === "opening" && openingIds.has(b.target.id)) &&
        !(b.target.kind === "item" && removedItems.has(b.target.id)),
    ),
    meters: p.meters.map((m) => ({
      ...m,
      roomId: m.roomId === roomId ? null : m.roomId,
      itemId: m.itemId && removedItems.has(m.itemId) ? null : m.itemId,
    })),
  };
}

export function deleteItem(p: Project, itemId: Id): Project {
  return {
    ...p,
    items: p.items.filter((i) => i.id !== itemId),
    bindings: p.bindings.filter((b) => !(b.target.kind === "item" && b.target.id === itemId)),
    meters: p.meters.map((m) => (m.itemId === itemId ? { ...m, itemId: null } : m)),
  };
}

export function deleteOpening(p: Project, openingId: Id): Project {
  return {
    ...p,
    openings: p.openings.filter((o) => o.id !== openingId),
    bindings: p.bindings.filter((b) => !(b.target.kind === "opening" && b.target.id === openingId)),
  };
}

export function duplicateRoom(p: Project, roomId: Id, delta: Vec2): { project: Project; id: Id } {
  const room = p.rooms.find((r) => r.id === roomId);
  if (!room) return { project: p, id: "" };
  const idMap = new Map<string, string>();
  const vertices = room.vertices.map((v) => {
    const id = newId("v");
    idMap.set(v.id, id);
    return { id, x: roundMm(v.x + delta.x), y: roundMm(v.y + delta.y) };
  });
  const copy: Room = {
    ...room,
    id: newId("room"),
    name: `${room.name} (Kopie)`,
    vertices,
    openEdges: room.openEdges.map((e) => idMap.get(e)!).filter(Boolean),
  };
  const openings = p.openings
    .filter((o) => o.roomId === roomId)
    .map((o) => ({ ...o, id: newId("open"), roomId: copy.id, edgeStart: idMap.get(o.edgeStart)! }));
  return { project: { ...p, rooms: [...p.rooms, copy], openings: [...p.openings, ...openings] }, id: copy.id };
}

export function duplicateItem(p: Project, itemId: Id, delta: Vec2): { project: Project; id: Id } {
  const it = p.items.find((i) => i.id === itemId);
  if (!it) return { project: p, id: "" };
  const copy = { ...it, id: newId("item"), x: roundMm(it.x + delta.x), y: roundMm(it.y + delta.y), acceptedIssues: [] };
  return { project: { ...p, items: [...p.items, copy] }, id: copy.id };
}

/** Passt eine Öffnung so an, dass sie vollständig auf ihrer Wand liegt. */
export function fitOpening(p: Project, openingId: Id): Project {
  const o = p.openings.find((x) => x.id === openingId);
  const room = o && p.rooms.find((r) => r.id === o.roomId);
  const e = room && o && edgeByStart(room, o.edgeStart);
  if (!o || !e) return p;
  const width = Math.min(o.width, Math.max(0.3, e.length - 0.1));
  const offset = Math.min(Math.max(o.offset, width / 2 + 0.05), e.length - width / 2 - 0.05);
  return { ...p, openings: p.openings.map((x) => (x.id === openingId ? { ...x, width: roundMm(width), offset: roundMm(offset) } : x)) };
}

export function addFloor(p: Project, name: string): { project: Project; id: Id } {
  const top = [...p.floors].sort((a, b) => b.elevation - a.elevation)[0];
  const elevation = top ? roundMm(top.elevation + top.height + 0.3) : 0;
  const floor: Floor = { id: newId("floor"), name, elevation, height: top?.height ?? 2.6 };
  return { project: { ...p, floors: [...p.floors, floor] }, id: floor.id };
}

/** Ändert die Höhe einer Etage und verschiebt alle darüberliegenden Etagen entsprechend. */
export function setFloorHeight(p: Project, floorId: Id, height: number): Project {
  const f = p.floors.find((x) => x.id === floorId);
  if (!f) return p;
  const diff = height - f.height;
  return {
    ...p,
    floors: p.floors.map((x) => (x.id === floorId ? { ...x, height } : x.elevation > f.elevation ? { ...x, elevation: roundMm(x.elevation + diff) } : x)),
  };
}

export function deleteFloor(p: Project, floorId: Id): Project {
  if (p.floors.length <= 1) return p;
  let next = p;
  for (const r of p.rooms.filter((x) => x.floorId === floorId)) next = deleteRoom(next, r.id, true);
  const itemIds = new Set(next.items.filter((i) => i.floorId === floorId).map((i) => i.id));
  return {
    ...next,
    floors: next.floors.filter((f) => f.id !== floorId),
    items: next.items.filter((i) => !itemIds.has(i.id)),
    voids: next.voids.filter((v) => v.floorId !== floorId),
    underlays: next.underlays.filter((u) => u.floorId !== floorId),
    bindings: next.bindings.filter((b) => !(b.target.kind === "item" && itemIds.has(b.target.id))),
    meters: next.meters.map((m) => (m.itemId && itemIds.has(m.itemId) ? { ...m, itemId: null } : m)),
  };
}
