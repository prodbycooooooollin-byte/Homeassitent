import { describe, expect, it } from "vitest";
import { pointInPolygon, polygonArea, polygonProblems, polygonsOverlap, roomEdges } from "@/geometry/polygon";
import { buildWalls, wallBoxes, EXTERIOR_THICKNESS, INTERIOR_THICKNESS } from "@/geometry/walls";
import { deleteRoom, fitOpening, insertVertex, moveEdge, removeVertex, resizeRectRoom, roomDeletionSummary } from "@/geometry/ops";
import { validateProject, openingProblems } from "@/geometry/validate";
import { placementIssues, snapToWall, itemCorners, convexOverlap } from "@/geometry/placement";
import { snapPoint } from "@/geometry/snapping";
import type { Item, Opening } from "@/model/types";
import { twoRooms } from "./helpers";

const item = (p: Partial<Item>): Item => ({
  id: "item_1", floorId: "floor_eg", catalogId: "sofa-3", name: "Sofa", x: 2, y: 2, elevation: 0, rotation: 0,
  width: 2, depth: 0.9, height: 0.8, material: "stoff", color: "#A9C2B6", acceptedIssues: [], ...p,
});

describe("Polygone", () => {
  it("berechnet Fläche und Punkt-im-Polygon", () => {
    const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    expect(polygonArea(sq)).toBeCloseTo(12);
    expect(pointInPolygon({ x: 1, y: 1 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 1 }, sq)).toBe(false);
  });
  it("erkennt Selbstüberschneidung und zu kleine Räume", () => {
    const bow = [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 4 }];
    expect(polygonProblems(bow).join()).toMatch(/überschneiden/);
    expect(polygonProblems([{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }, { x: 0, y: 0.5 }]).join()).toMatch(/1 m²/);
  });
  it("Nachbarräume mit gemeinsamer Wand überlappen nicht", () => {
    const p = twoRooms();
    expect(polygonsOverlap(p.rooms[0].vertices, p.rooms[1].vertices)).toBe(false);
    const shifted = p.rooms[1].vertices.map((v) => ({ ...v, x: v.x - 1 }));
    expect(polygonsOverlap(p.rooms[0].vertices, shifted)).toBe(true);
  });
  it("Innennormalen zeigen ins Rauminnere", () => {
    const p = twoRooms();
    for (const e of roomEdges(p.rooms[0])) {
      const mid = { x: (e.a.x + e.b.x) / 2 + e.inward.x * 0.1, y: (e.a.y + e.b.y) / 2 + e.inward.y * 0.1 };
      expect(pointInPolygon(mid, p.rooms[0].vertices)).toBe(true);
    }
  });
});

describe("Wände aus Grundriss", () => {
  it("erzeugt gemeinsame Innenwand genau einmal", () => {
    const p = twoRooms();
    const walls = buildWalls(p, p.floors[0]);
    const interior = walls.filter((w) => !w.exterior);
    expect(interior).toHaveLength(1);
    expect(interior[0].thickness).toBe(INTERIOR_THICKNESS);
    expect(interior[0].length).toBeCloseTo(4);
    // Außenwände: Raum A 3 Kanten (4+4+4=12 m), Raum B 3 Kanten (3+4+3=10 m)
    const ext = walls.filter((w) => w.exterior);
    expect(ext.reduce((s, w) => s + w.length, 0)).toBeCloseTo(22);
    expect(ext[0].thickness).toBe(EXTERIOR_THICKNESS);
  });
  it("offene Kante entfernt die gemeinsame Wand", () => {
    const p = twoRooms();
    const shared = roomEdges(p.rooms[0]).find((e) => Math.abs(e.a.x - 4) < 1e-6 && Math.abs(e.b.x - 4) < 1e-6)!;
    p.rooms[0] = { ...p.rooms[0], openEdges: [shared.startId] };
    expect(buildWalls(p, p.floors[0]).filter((w) => !w.exterior)).toHaveLength(0);
  });
  it("schneidet Fenster und Türen aus der Wand", () => {
    const p = twoRooms();
    const top = roomEdges(p.rooms[0])[0]; // (0,0)->(4,0)
    const win: Opening = { id: "o1", roomId: "room_a", edgeStart: top.startId, offset: 2, width: 1.2, height: 1.3, sill: 0.9, kind: "window", hinge: "left" };
    p.openings = [win];
    const wall = buildWalls(p, p.floors[0]).find((w) => w.edgeStart === top.startId)!;
    expect(wall.cuts).toHaveLength(1);
    expect(wall.cuts[0].from).toBeCloseTo(1.4);
    expect(wall.cuts[0].to).toBeCloseTo(2.6);
    const boxes = wallBoxes(wall);
    // links, unter Fenster, über Fenster, rechts
    expect(boxes).toHaveLength(4);
    const cut = wallBoxes(wall, 1.0);
    expect(Math.max(...cut.map((b) => b.y0 + b.height))).toBeLessThanOrEqual(1.0 + 1e-9);
  });
  it("Tür in der Innenwand wird auch geschnitten, wenn der Nachbarraum die Wand erzeugt", () => {
    const p = twoRooms();
    const shared = roomEdges(p.rooms[1]).find((e) => Math.abs(e.a.x - 4) < 1e-6 && Math.abs(e.b.x - 4) < 1e-6)!;
    p.openings = [{ id: "d1", roomId: "room_b", edgeStart: shared.startId, offset: 2, width: 0.9, height: 2.1, sill: 0, kind: "door", hinge: "left" }];
    const interior = buildWalls(p, p.floors[0]).find((w) => !w.exterior)!;
    expect(interior.roomId).toBe("room_a");
    expect(interior.cuts).toHaveLength(1);
  });
});

describe("Bearbeiten des Grundrisses", () => {
  it("Wand verschieben bewegt deckungsgleiche Ecken des Nachbarraums mit", () => {
    const p = twoRooms();
    const shared = roomEdges(p.rooms[0]).find((e) => Math.abs(e.a.x - 4) < 1e-6 && Math.abs(e.b.x - 4) < 1e-6)!;
    const moved = moveEdge(p, "room_a", shared.startId, { x: 0.5, y: 0 });
    expect(Math.max(...moved.rooms[0].vertices.map((v) => v.x))).toBeCloseTo(4.5);
    expect(Math.min(...moved.rooms[1].vertices.map((v) => v.x))).toBeCloseTo(4.5);
    expect(buildWalls(moved, moved.floors[0]).filter((w) => !w.exterior)).toHaveLength(1);
  });
  it("Rechteckraum per Maß ändern", () => {
    const p = twoRooms();
    const r = resizeRectRoom(p, "room_b", 3.5, 4);
    expect(Math.max(...r.rooms[1].vertices.map((v) => v.x))).toBeCloseTo(7.5);
  });
  it("Ecke einfügen verschiebt Öffnungen auf die neue Kante, Entfernen stellt sie wieder her", () => {
    const p = twoRooms();
    const top = roomEdges(p.rooms[0])[0];
    p.openings = [{ id: "o1", roomId: "room_a", edgeStart: top.startId, offset: 3, width: 0.8, height: 1, sill: 1, kind: "window", hinge: "left" }];
    const { project, vertexId } = insertVertex(p, "room_a", top.startId, { x: 2, y: 0 });
    expect(project.openings[0].edgeStart).toBe(vertexId);
    expect(project.openings[0].offset).toBeCloseTo(1);
    const back = removeVertex(project, "room_a", vertexId);
    expect(back.openings[0].edgeStart).toBe(top.startId);
    expect(back.openings[0].offset).toBeCloseTo(3);
  });
  it("meldet Öffnungen außerhalb der Wand und passt sie auf Wunsch ein", () => {
    const p = twoRooms();
    const top = roomEdges(p.rooms[1])[0]; // 3 m
    p.openings = [{ id: "o1", roomId: "room_b", edgeStart: top.startId, offset: 2.8, width: 1.2, height: 1, sill: 1, kind: "window", hinge: "left" }];
    expect(openingProblems(p, "o1").join()).toMatch(/außerhalb/);
    const fixed = fitOpening(p, "o1");
    expect(openingProblems(fixed, "o1")).toHaveLength(0);
  });
  it("Raum löschen: Inhalte behalten oder mitlöschen", () => {
    const p = twoRooms();
    p.items = [item({ id: "item_1", x: 5.5, y: 2, catalogId: "floor-lamp", width: 0.4, depth: 0.4 })];
    p.bindings = [{ id: "b1", entityId: "light.kueche", target: { kind: "item", id: "item_1" }, role: "light", confirmedAt: "x", via: "manual" }];
    expect(roomDeletionSummary(p, "room_b").items).toHaveLength(1);
    const keep = deleteRoom(p, "room_b", false);
    expect(keep.items).toHaveLength(1);
    expect(keep.bindings).toHaveLength(1);
    expect(validateProject(keep).some((i) => i.code === "outside")).toBe(true);
    const drop = deleteRoom(p, "room_b", true);
    expect(drop.items).toHaveLength(0);
    expect(drop.bindings).toHaveLength(0);
  });
});

describe("Platzierung", () => {
  it("erkennt Kollision mit Wand und Überschneidung", () => {
    const p = twoRooms();
    p.items = [item({ id: "a", x: 4, y: 2 })];
    expect(placementIssues(p.items[0], p).map((i) => i.code)).toContain("wall");
    p.items = [item({ id: "a", x: 2, y: 2 }), item({ id: "b", x: 2.5, y: 2.2 })];
    expect(placementIssues(p.items[0], p).map((i) => i.code)).toContain("overlap");
  });
  it("bewusst akzeptierte Hinweise werden nicht mehr gemeldet", () => {
    const p = twoRooms();
    p.items = [item({ id: "a", x: 4, y: 2, acceptedIssues: ["wall"] })];
    expect(placementIssues(p.items[0], p).map((i) => i.code)).not.toContain("wall");
  });
  it("rastet mit der Rückseite an der Wand ein", () => {
    const p = twoRooms();
    const walls = buildWalls(p, p.floors[0]);
    const s = snapToWall({ x: 2, y: 0.7, depth: 0.9, rotation: 1 }, walls, "room_a", p.rooms)!;
    expect(s).not.toBeNull();
    expect(s.y).toBeCloseTo(EXTERIOR_THICKNESS / 2 + 0.45 + 0.005, 3);
    expect(Math.abs(Math.sin(s.rotation))).toBeLessThan(1e-9);
    const corners = itemCorners({ x: s.x, y: s.y, width: 2, depth: 0.9, rotation: s.rotation });
    expect(Math.min(...corners.map((c) => c.y))).toBeGreaterThan(EXTERIOR_THICKNESS / 2);
  });
  it("SAT-Überlappung", () => {
    const a = itemCorners({ x: 0, y: 0, width: 1, depth: 1, rotation: 0 });
    const b = itemCorners({ x: 1.1, y: 0, width: 1, depth: 1, rotation: Math.PI / 4 });
    expect(convexOverlap(a, b)).toBe(true);
    const c = itemCorners({ x: 2, y: 0, width: 1, depth: 1, rotation: 0 });
    expect(convexOverlap(a, c)).toBe(false);
  });
});

describe("Fangpunkte", () => {
  it("bevorzugt Ecken, dann Ausrichtung, dann Raster", () => {
    const ctx = { grid: 0.1, vertices: [{ x: 1, y: 1 }], segments: [], tolerance: 0.2, enabled: true };
    expect(snapPoint({ x: 1.05, y: 0.95 }, ctx).kind).toBe("vertex");
    const al = snapPoint({ x: 1.08, y: 3.33 }, ctx);
    expect(al.kind).toBe("align");
    expect(al.point.x).toBe(1);
    const g = snapPoint({ x: 3.33, y: 3.37 }, ctx);
    expect(g.kind).toBe("grid");
    expect(g.point.x).toBeCloseTo(3.3);
  });
});
