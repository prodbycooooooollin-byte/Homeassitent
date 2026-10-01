import type { Project, Room, Vec2 } from "@/model/types";
import { roomEdges, type Edge } from "@/geometry/polygon";
import { closestOnSegment, dot, sub } from "@/geometry/vec";

export interface View {
  scale: number;
  ox: number;
  oy: number;
}

export const toScreen = (v: View, p: Vec2): Vec2 => ({ x: p.x * v.scale + v.ox, y: p.y * v.scale + v.oy });
export const toPlan = (v: View, p: Vec2): Vec2 => ({ x: (p.x - v.ox) / v.scale, y: (p.y - v.oy) / v.scale });

export function fmtM(n: number): string {
  return `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

export function nearestEdge(project: Project, floorId: string, p: Vec2, tol: number): { room: Room; edge: Edge; s: number; dist: number } | null {
  let best: { room: Room; edge: Edge; s: number; dist: number } | null = null;
  for (const room of project.rooms) {
    if (room.floorId !== floorId) continue;
    for (const e of roomEdges(room)) {
      const c = closestOnSegment(p, e.a, e.b);
      if (c.distance > tol) continue;
      // Bei gemeinsamen Wänden den Raum auf der Klickseite bevorzugen
      const side = dot(sub(p, c.point), e.inward);
      const score = c.distance - (side > 0 ? 1e-4 : 0);
      if (!best || score < best.dist) best = { room, edge: e, s: dot(sub(c.point, e.a), e.dir), dist: score };
    }
  }
  return best;
}

/** Passt die Ansicht ein; inset berücksichtigt schwebende Bedienelemente (oben, rechts, unten, links). */
export function fitView(points: Vec2[], width: number, height: number, inset = { t: 140, r: 40, b: 110, l: 100 }): View {
  if (!points.length || width < 10 || height < 10) return { scale: 50, ox: width / 2 - 250, oy: height / 2 - 200 };
  const availW = Math.max(100, width - inset.l - inset.r);
  const availH = Math.max(100, height - inset.t - inset.b);
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const w = Math.max(maxX - minX, 2);
  const h = Math.max(maxY - minY, 2);
  const scale = Math.max(8, Math.min(200, Math.min(availW / w, availH / h)));
  return { scale, ox: inset.l + availW / 2 - ((minX + maxX) / 2) * scale, oy: inset.t + availH / 2 - ((minY + maxY) / 2) * scale };
}

export const FLOOR_FILL: Record<string, string> = {
  oak: "#EADBC3",
  walnut: "#D9C2A7",
  tiles: "#E7EBEA",
  stone: "#E4E1DA",
  carpet: "#E8E2D8",
  concrete: "#E1E1DD",
};
