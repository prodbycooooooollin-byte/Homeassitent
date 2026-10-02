import { describe, expect, it } from "vitest";
import { parseProjectFile, toProjectFile } from "@/model/schema";
import { twoRooms } from "./helpers";

describe("Projektformat", () => {
  it("Export und Import erhalten den Inhalt vollständig", () => {
    const p = twoRooms();
    p.items = [{ id: "i1", floorId: "floor_eg", catalogId: "sofa-3", name: "Sofa", x: 1, y: 1, elevation: 0, rotation: 0.5, width: 2, depth: 0.9, height: 0.8, material: "stoff", color: "#A9C2B6", acceptedIssues: ["wall"] }];
    p.bindings = [{ id: "b1", entityId: "light.wohnzimmer", target: { kind: "room", id: "room_a" }, role: "sensor", confirmedAt: "2026-10-01T00:00:00Z", via: "manual" }];
    const file = JSON.parse(JSON.stringify(toProjectFile(p)));
    const r = parseProjectFile(file);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.project).toEqual(p);
  });
  it("lehnt ungültige Dateien mit verständlichen Fehlern ab", () => {
    expect(parseProjectFile({ hello: 1 }).ok).toBe(false);
    const p = twoRooms();
    const f = toProjectFile(p) as unknown as { project: { rooms: { floorId: string }[] } };
    f.project.rooms[0].floorId = "gibt_es_nicht";
    const r = parseProjectFile(f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/unbekannte Etage/);
  });
  it("lehnt neuere Formatversionen ab", () => {
    const f = { ...toProjectFile(twoRooms()), formatVersion: 99 };
    const r = parseProjectFile(f);
    expect(r.ok).toBe(false);
  });
  it("verwirft unbekannte Felder (z. B. eingeschleuste Zugangsdaten)", () => {
    const f = toProjectFile(twoRooms()) as unknown as Record<string, unknown> & { project: Record<string, unknown> };
    f.project.haToken = "geheim";
    const r = parseProjectFile(f);
    expect(r.ok).toBe(true);
    if (r.ok) expect(JSON.stringify(r.value)).not.toContain("geheim");
  });
  it("repariert hängende Verweise mit Warnung", () => {
    const p = twoRooms();
    p.bindings = [{ id: "b1", entityId: "light.x", target: { kind: "item", id: "fehlt" }, role: "light", confirmedAt: "x", via: "manual" }];
    const r = parseProjectFile(toProjectFile(p));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.project.bindings).toHaveLength(0);
      expect(r.warnings.length).toBe(1);
    }
  });
});
