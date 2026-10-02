// Ableitung der Wände aus den Raumpolygonen.
//
// Jede Raumkante ist eine Wandachse. Liegt eine Kante (teilweise) kollinear
// auf der Kante eines Nachbarraums derselben Etage, ist dieser Abschnitt eine
// Innenwand und wird nur EINMAL erzeugt (vom Raum mit der kleineren ID).
// Nicht geteilte Abschnitte sind Außenwände. Markiert einer der beteiligten
// Räume die Kante als offen, entsteht dort keine Wand.
//
// Das 2D-Planbild und das 3D-Modell verwenden ausschließlich diese Funktion –
// es gibt keine zweite, getrennt gepflegte Wandgeometrie.
import type { Floor, Opening, Project, Room, Vec2 } from "@/model/types";
import { roomEdges, type Edge } from "./polygon";
import { EPS, add, cross, dot, lerp, scale, sub } from "./vec";

export const EXTERIOR_THICKNESS = 0.24;
export const INTERIOR_THICKNESS = 0.12;

export interface WallOpeningCut {
  openingId: string;
  kind: Opening["kind"];
  /** Position entlang des Wandabschnitts in m (ab a) */
  from: number;
  to: number;
  sill: number;
  top: number;
}

export interface WallSegment {
  key: string;
  roomId: string;
  edgeStart: string;
  a: Vec2;
  b: Vec2;
  length: number;
  dir: Vec2;
  exterior: boolean;
  thickness: number;
  height: number;
  /** Verlängerung an den Enden zum Schließen der Ecken */
  extendStart: number;
  extendEnd: number;
  cuts: WallOpeningCut[];
  color: string;
}

interface Interval {
  t0: number;
  t1: number;
  coverRoomId: string | null;
  coverOpen: boolean;
}

const COLLINEAR_TOL = 0.01; // 1 cm

/** Teil der Kante e, der kollinear von f überdeckt wird, als Parameterintervall auf e (in m). */
function overlapOnEdge(e: Edge, f: Edge): [number, number] | null {
  if (Math.abs(cross(e.dir, f.dir)) > 0.002) return null;
  // Abstand von f zur Geraden durch e
  const off = cross(e.dir, sub(f.a, e.a));
  if (Math.abs(off) > COLLINEAR_TOL) return null;
  const s0 = dot(sub(f.a, e.a), e.dir);
  const s1 = dot(sub(f.b, e.a), e.dir);
  const lo = Math.max(0, Math.min(s0, s1));
  const hi = Math.min(e.length, Math.max(s0, s1));
  if (hi - lo < 0.02) return null;
  return [lo, hi];
}

function splitEdge(e: Edge, room: Room, others: Room[]): Interval[] {
  const covers: { t0: number; t1: number; roomId: string; open: boolean }[] = [];
  for (const o of others) {
    for (const f of roomEdges(o)) {
      const ov = overlapOnEdge(e, f);
      if (ov) covers.push({ t0: ov[0], t1: ov[1], roomId: o.id, open: o.openEdges.includes(f.startId) });
    }
  }
  const cuts = new Set<number>([0, e.length]);
  covers.forEach((c) => {
    cuts.add(c.t0);
    cuts.add(c.t1);
  });
  const ts = [...cuts].sort((x, y) => x - y);
  const out: Interval[] = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i];
    const t1 = ts[i + 1];
    if (t1 - t0 < 0.005) continue;
    const mid = (t0 + t1) / 2;
    const c = covers.find((cv) => cv.t0 <= mid && cv.t1 >= mid);
    const prev = out[out.length - 1];
    const coverRoomId = c ? c.roomId : null;
    const coverOpen = c ? c.open : false;
    if (prev && prev.coverRoomId === coverRoomId && prev.coverOpen === coverOpen && Math.abs(prev.t1 - t0) < 1e-6) prev.t1 = t1;
    else out.push({ t0, t1, coverRoomId, coverOpen });
  }
  void room;
  return out;
}

export interface OpeningPlacement {
  opening: Opening;
  room: Room;
  edge: Edge;
  center: Vec2;
  a: Vec2;
  b: Vec2;
}

export function placeOpening(o: Opening, rooms: Room[]): OpeningPlacement | null {
  const room = rooms.find((r) => r.id === o.roomId);
  if (!room) return null;
  const edge = roomEdges(room).find((e) => e.startId === o.edgeStart);
  if (!edge) return null;
  const center = add(edge.a, scale(edge.dir, o.offset));
  return {
    opening: o,
    room,
    edge,
    center,
    a: add(edge.a, scale(edge.dir, o.offset - o.width / 2)),
    b: add(edge.a, scale(edge.dir, o.offset + o.width / 2)),
  };
}

export function buildWalls(project: Pick<Project, "rooms" | "openings">, floor: Floor): WallSegment[] {
  // Außenbereiche haben keine Wände und machen angrenzende Außenwände nicht zu Innenwänden
  const rooms = project.rooms.filter((r) => r.floorId === floor.id && !r.outdoor);
  const roomIds = new Set(rooms.map((r) => r.id));
  const placements = project.openings
    .filter((o) => roomIds.has(o.roomId))
    .map((o) => placeOpening(o, rooms))
    .filter((p): p is OpeningPlacement => !!p);

  const segments: WallSegment[] = [];
  for (const room of rooms) {
    const others = rooms.filter((r) => r.id !== room.id);
    for (const e of roomEdges(room)) {
      if (e.length < EPS) continue;
      const ownOpen = room.openEdges.includes(e.startId);
      for (const iv of splitEdge(e, room, others)) {
        const exterior = iv.coverRoomId === null;
        if (ownOpen || iv.coverOpen) continue;
        if (!exterior && iv.coverRoomId! < room.id) continue; // wird vom Nachbarraum erzeugt
        const thickness = exterior ? EXTERIOR_THICKNESS : INTERIOR_THICKNESS;
        const a = lerp(e.a, e.b, iv.t0 / e.length);
        const b = lerp(e.a, e.b, iv.t1 / e.length);
        const len = iv.t1 - iv.t0;
        const cuts: WallOpeningCut[] = [];
        for (const p of placements) {
          // Öffnung muss auf derselben Geraden liegen
          if (Math.abs(cross(e.dir, p.edge.dir)) > 0.002) continue;
          if (Math.abs(cross(e.dir, sub(p.center, e.a))) > COLLINEAR_TOL) continue;
          const s0 = dot(sub(p.a, a), e.dir);
          const s1 = dot(sub(p.b, a), e.dir);
          const from = Math.max(0, Math.min(s0, s1));
          const to = Math.min(len, Math.max(s0, s1));
          if (to - from < 0.01) continue;
          cuts.push({
            openingId: p.opening.id,
            kind: p.opening.kind,
            from,
            to,
            sill: p.opening.kind === "window" ? p.opening.sill : 0,
            top: Math.min(floor.height, (p.opening.kind === "window" ? p.opening.sill : 0) + p.opening.height),
          });
        }
        cuts.sort((x, y) => x.from - y.from);
        segments.push({
          key: `${room.id}:${e.startId}:${iv.t0.toFixed(3)}`,
          roomId: room.id,
          edgeStart: e.startId,
          a,
          b,
          length: len,
          dir: e.dir,
          exterior,
          thickness,
          height: floor.height,
          extendStart: iv.t0 < 0.005 ? thickness / 2 : 0,
          extendEnd: iv.t1 > e.length - 0.005 ? thickness / 2 : 0,
          cuts,
          color: room.wallColor,
        });
      }
    }
  }
  return segments;
}

export interface WallBox {
  /** Mittelpunkt in der Planebene */
  cx: number;
  cy: number;
  /** Unterkante und Höhe in m relativ zum Fußboden */
  y0: number;
  height: number;
  length: number;
  thickness: number;
  angle: number;
  exterior: boolean;
}

/**
 * Zerlegt einen Wandabschnitt in Quader (Wandstücke neben, unter und über
 * Öffnungen). maxHeight erlaubt das Anschneiden der Wände für die Innenansicht.
 */
export function wallBoxes(seg: WallSegment, maxHeight = Infinity): WallBox[] {
  const H = Math.min(seg.height, maxHeight);
  if (H <= 0.001) return [];
  const angle = Math.atan2(seg.dir.y, seg.dir.x);
  const boxes: WallBox[] = [];
  const push = (s0: number, s1: number, y0: number, y1: number) => {
    const top = Math.min(y1, H);
    if (s1 - s0 < 0.005 || top - y0 < 0.005) return;
    const mid = (s0 + s1) / 2;
    const c = add(seg.a, scale(seg.dir, mid));
    boxes.push({ cx: c.x, cy: c.y, y0, height: top - y0, length: s1 - s0, thickness: seg.thickness, angle, exterior: seg.exterior });
  };
  let cursor = -seg.extendStart;
  for (const cut of seg.cuts) {
    push(cursor, cut.from, 0, seg.height);
    if (cut.sill > 0) push(cut.from, cut.to, 0, cut.sill);
    if (cut.top < seg.height) push(cut.from, cut.to, cut.top, seg.height);
    cursor = Math.max(cursor, cut.to);
  }
  push(cursor, seg.length + seg.extendEnd, 0, seg.height);
  return boxes;
}

/** Eckpunkte des Wand-Rechtecks (für Kollisionsprüfungen in 2D). */
export function wallRect(seg: WallSegment): Vec2[] {
  const n = { x: -seg.dir.y, y: seg.dir.x };
  const h = seg.thickness / 2;
  const a = add(seg.a, scale(seg.dir, -seg.extendStart));
  const b = add(seg.b, scale(seg.dir, seg.extendEnd));
  return [add(a, scale(n, h)), add(b, scale(n, h)), add(b, scale(n, -h)), add(a, scale(n, -h))];
}
