// Berechnet aus Projekt und Live-Zuständen die Darstellung im Modell:
// Lichter, Rollläden, offene Fenster, Raumeinfärbungen (Klima, Energie).
import { useMemo } from "react";
import type { Project } from "@/model/types";
import type { HaState } from "@/devices/ha-types";
import { capabilityOf } from "@/devices/capabilities";
import { contactView, coverView, freshness, lightColor, lightView, numericState } from "@/devices/state";
import { entryFor } from "@/catalog/catalog";
import { roomAggregates } from "@/energy/aggregate";
import { livePowerValues } from "@/energy/live";
import type { Layers, Tab } from "@/store/ui";
import { validateProject } from "@/geometry/validate";
import type { OverlayInfo } from "./HouseModel";

export function temperatureColor(t: number): string {
  if (t < 18) return "#6F9BC8";
  if (t < 19.5) return "#9DBBD6";
  if (t <= 23) return "#8DB59E";
  if (t <= 25) return "#E0B55F";
  return "#D98256";
}

export function roomTemperature(project: Project, roomId: string, states: Record<string, HaState>, connected: boolean): number | null {
  for (const b of project.bindings) {
    if (b.target.kind !== "room" || b.target.id !== roomId) continue;
    const s = states[b.entityId];
    if (!s || freshness(s, connected).availability !== "ok") continue;
    const cap = capabilityOf(s);
    if (cap.kind === "sensor" && cap.quantity === "temperature") return numericState(s);
  }
  return null;
}

export function useOverlay(project: Project | null, states: Record<string, HaState>, connected: boolean, layers: Layers, tab: Tab, showIssues: boolean): OverlayInfo {
  const issues = useMemo(() => {
    if (!project || !showIssues) return new Set<string>();
    return new Set(validateProject(project).filter((i) => i.target?.kind === "item").map((i) => (i.target as { id: string }).id));
  }, [project, showIssues]);

  return useMemo(() => {
    const out: OverlayInfo = { roomTint: new Map(), shutters: new Map(), openOpenings: new Set(), lights: new Map(), issues };
    if (!project) return out;
    for (const b of project.bindings) {
      const s = states[b.entityId];
      if (b.target.kind === "item" && (b.role === "light" || b.role === "switch")) {
        const it = project.items.find((i) => i.id === b.target.id);
        if (!it || !entryFor(it.catalogId).light) continue;
        if (b.role === "light") {
          const l = lightView(s);
          if (l.on) out.lights.set(it.id, { on: true, color: lightColor(l), level: (l.brightnessPct ?? 100) / 100 });
          else if (!out.lights.has(it.id)) out.lights.set(it.id, { on: false, color: "#ffffff", level: 0 });
        } else if (s?.state === "on") out.lights.set(it.id, { on: true, color: "#FFD8A0", level: 1 });
      }
      if (b.target.kind === "opening") {
        if (b.role === "cover") {
          const c = coverView(s);
          out.shutters.set(b.target.id, c.position !== null ? 1 - c.position / 100 : c.state === "closed" ? 1 : c.state === "open" ? 0 : null);
        }
        if (b.role === "contact" && layers.windows) {
          const c = contactView(s);
          if (c === "open" || c === "tilted") out.openOpenings.add(b.target.id);
        }
      }
    }
    const energyView = layers.energy || tab === "energy";
    if (energyView) {
      const values = livePowerValues(project.meters, states, connected);
      const rooms = roomAggregates(project, values);
      const max = Math.max(1, ...rooms.map((r) => r.value ?? 0));
      for (const r of rooms) {
        if (r.value === null) continue;
        out.roomTint.set(r.roomId, { color: "#7866B2", opacity: 0.1 + 0.4 * Math.min(1, r.value / max) });
      }
    } else if (layers.climate) {
      for (const r of project.rooms) {
        const t = roomTemperature(project, r.id, states, connected);
        if (t !== null) out.roomTint.set(r.id, { color: temperatureColor(t), opacity: 0.32 });
      }
    }
    // Licht im Raum: warmer Schimmer auf dem Boden, begrenzt auf das Raumpolygon
    if (!energyView && !layers.climate) {
      const byRoom = new Map<string, { level: number; color: string }>();
      for (const [itemId, l] of out.lights) {
        if (!l.on) continue;
        const it = project.items.find((i) => i.id === itemId)!;
        const room = project.rooms.find((r) => r.floorId === it.floorId && pointIn(it, r.vertices));
        if (!room) continue;
        const cur = byRoom.get(room.id);
        byRoom.set(room.id, { level: Math.min(1, (cur?.level ?? 0) + l.level * 0.6), color: cur?.color ?? l.color });
      }
      for (const [roomId, v] of byRoom) out.roomTint.set(roomId, { color: v.color, opacity: 0.08 + 0.16 * v.level });
    }
    return out;
  }, [project, states, connected, layers.windows, layers.energy, layers.climate, tab, issues]);
}

function pointIn(p: { x: number; y: number }, pts: { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
