// Fangpunkte und Hilfslinien im Grundriss-Editor.
import type { Vec2 } from "@/model/types";
import { closestOnSegment, dist } from "./vec";

export interface Guide {
  a: Vec2;
  b: Vec2;
}

export interface SnapResult {
  point: Vec2;
  kind: "vertex" | "edge" | "align" | "grid" | "none";
  guides: Guide[];
}

export interface SnapContext {
  grid: number;
  vertices: Vec2[];
  segments: [Vec2, Vec2][];
  /** Fangradius in Metern (abhängig vom Zoom) */
  tolerance: number;
  enabled: boolean;
}

export const snapToGrid = (n: number, g: number) => Math.round(n / g) * g;

export function snapPoint(p: Vec2, ctx: SnapContext): SnapResult {
  if (!ctx.enabled) return { point: p, kind: "none", guides: [] };
  // 1. Ecken
  let best: Vec2 | null = null;
  let bestD = ctx.tolerance;
  for (const v of ctx.vertices) {
    const d = dist(p, v);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  if (best) return { point: { ...best }, kind: "vertex", guides: [] };

  // 2. Ausrichtung an vorhandenen Ecken (horizontal/vertikal)
  let ax: Vec2 | null = null;
  let ay: Vec2 | null = null;
  let dx = ctx.tolerance * 0.7;
  let dy = ctx.tolerance * 0.7;
  for (const v of ctx.vertices) {
    if (Math.abs(v.x - p.x) < dx) {
      dx = Math.abs(v.x - p.x);
      ax = v;
    }
    if (Math.abs(v.y - p.y) < dy) {
      dy = Math.abs(v.y - p.y);
      ay = v;
    }
  }
  if (ax || ay) {
    const point = { x: ax ? ax.x : snapToGrid(p.x, ctx.grid), y: ay ? ay.y : snapToGrid(p.y, ctx.grid) };
    const guides: Guide[] = [];
    if (ax) guides.push({ a: ax, b: point });
    if (ay) guides.push({ a: ay, b: point });
    return { point, kind: "align", guides };
  }

  // 3. Auf Wandkante
  let edgePt: Vec2 | null = null;
  let edgeD = ctx.tolerance * 0.6;
  for (const [a, b] of ctx.segments) {
    const c = closestOnSegment(p, a, b);
    if (c.distance < edgeD) {
      edgeD = c.distance;
      edgePt = c.point;
    }
  }
  if (edgePt) return { point: edgePt, kind: "edge", guides: [] };

  // 4. Raster
  return { point: { x: snapToGrid(p.x, ctx.grid), y: snapToGrid(p.y, ctx.grid) }, kind: "grid", guides: [] };
}
