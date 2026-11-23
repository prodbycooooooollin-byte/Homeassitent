import type { Room, Vec2, Vertex } from "@/model/types";
import { EPS, closestOnSegment, cross, dist, length, normalize, perp, sub } from "./vec";

/** Signierte Fläche (Shoelace). In Planebene (y nach unten) ist positiv = im Uhrzeigersinn auf dem Bildschirm. */
export function signedArea(pts: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const polygonArea = (pts: Vec2[]) => Math.abs(signedArea(pts));

export function centroid(pts: Vec2[]): Vec2 {
  const a = signedArea(pts);
  if (Math.abs(a) < EPS) {
    const n = pts.length || 1;
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function bounds(pts: Vec2[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Punkt strikt im Polygon (Ray-Casting). Punkte auf dem Rand gelten als außerhalb, wenn strict=true. */
export function pointInPolygon(p: Vec2, pts: Vec2[], strict = false, tol = 1e-4): boolean {
  if (strict) {
    for (let i = 0; i < pts.length; i++) {
      if (closestOnSegment(p, pts[i], pts[(i + 1) % pts.length]).distance < tol) return false;
    }
  }
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function orient(a: Vec2, b: Vec2, c: Vec2) {
  return cross(sub(b, a), sub(c, a));
}

/** Echte Kreuzung zweier Strecken (gemeinsame Endpunkte oder Berührung zählen nicht). */
export function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2, tol = 1e-9): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return ((o1 > tol && o2 < -tol) || (o1 < -tol && o2 > tol)) && ((o3 > tol && o4 < -tol) || (o3 < -tol && o4 > tol));
}

/** Strecken überlappen kollinear oder berühren sich (für Selbstüberschneidungsprüfung nicht-benachbarter Kanten). */
function segmentsTouch(a: Vec2, b: Vec2, c: Vec2, d: Vec2, tol = 1e-4): boolean {
  if (segmentsCross(a, b, c, d)) return true;
  return (
    closestOnSegment(c, a, b).distance < tol ||
    closestOnSegment(d, a, b).distance < tol ||
    closestOnSegment(a, c, d).distance < tol ||
    closestOnSegment(b, c, d).distance < tol
  );
}

/** Liefert eine Liste von Problemen; leer = einfaches, gültiges Polygon. */
export function polygonProblems(pts: Vec2[]): string[] {
  const problems: string[] = [];
  if (pts.length < 3) return ["Ein Raum braucht mindestens drei Ecken."];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (dist(a, b) < 0.2) {
      problems.push("Eine Wand ist kürzer als 20 cm.");
      break;
    }
  }
  const n = pts.length;
  outer: for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsTouch(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) {
        problems.push("Wände überschneiden sich – der Raum ist nicht eindeutig.");
        break outer;
      }
    }
  }
  const a = polygonArea(pts);
  if (a < 1) problems.push("Die Fläche ist kleiner als 1 m².");
  const bb = bounds(pts);
  if (bb.width > 80 || bb.height > 80) problems.push("Der Raum ist größer als 80 m in einer Richtung.");
  return problems;
}

export interface Edge {
  index: number;
  startId: string;
  endId: string;
  a: Vec2;
  b: Vec2;
  length: number;
  dir: Vec2;
  /** Normale, die ins Rauminnere zeigt */
  inward: Vec2;
}

export function roomEdges(room: Pick<Room, "vertices">): Edge[] {
  const pts = room.vertices;
  const ccwSign = Math.sign(signedArea(pts)) || 1;
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length] as Vertex;
    const d = normalize(sub(b, a));
    // perp(d) = (-dy, dx). Bei positiver Fläche (y nach unten) zeigt perp nach innen.
    const n = perp(d);
    const inward = ccwSign > 0 ? n : { x: -n.x, y: -n.y };
    return { index: i, startId: a.id, endId: b.id, a, b, length: length(sub(b, a)), dir: d, inward };
  });
}

export function edgeByStart(room: Pick<Room, "vertices">, startId: string): Edge | undefined {
  return roomEdges(room).find((e) => e.startId === startId);
}

/** Überlappen sich zwei Polygone flächig? (Berührende Nachbarräume überlappen nicht.) */
export function polygonsOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length], 1e-7)) return true;
    }
  }
  const probe = (src: Vec2[], dst: Vec2[]) => {
    for (const p of src) if (pointInPolygon(p, dst, true, 1e-3)) return true;
    // Kantenmitten leicht nach innen versetzt (erfasst kollineare Überlappungen)
    for (const e of roomEdges({ vertices: src.map((p, i) => ({ ...p, id: String(i) })) })) {
      const mid = { x: (e.a.x + e.b.x) / 2 + e.inward.x * 0.02, y: (e.a.y + e.b.y) / 2 + e.inward.y * 0.02 };
      if (pointInPolygon(mid, dst, true, 1e-3)) return true;
    }
    const c = centroid(src);
    return pointInPolygon(c, src, true) && pointInPolygon(c, dst, true, 1e-3);
  };
  return probe(a, b) || probe(b, a);
}

export function isAxisAlignedRect(pts: Vec2[], tol = 1e-3): boolean {
  if (pts.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    if (Math.abs(a.x - b.x) > tol && Math.abs(a.y - b.y) > tol) return false;
  }
  const bb = bounds(pts);
  return bb.width > tol && bb.height > tol;
}
