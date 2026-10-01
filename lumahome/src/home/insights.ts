// Hinweise mit verständlichem Text – nur aus tatsächlich vorliegenden Daten.
import type { Project } from "@/model/types";
import type { HaState } from "@/devices/ha-types";
import { describeBinding } from "@/devices/view";
import { climateView, contactView, numericState } from "@/devices/state";
import { capabilityOf } from "@/devices/capabilities";
import { itemRoom } from "@/geometry/placement";
import type { PendingCommand } from "@/store/live";

export interface Insight {
  key: string;
  tone: "warn" | "info";
  text: string;
  roomId: string | null;
  target: { kind: "item" | "opening" | "room"; id: string } | null;
}

export function roomOfBinding(project: Project, t: { kind: string; id: string }): string | null {
  if (t.kind === "room") return t.id;
  if (t.kind === "opening") return project.openings.find((o) => o.id === t.id)?.roomId ?? null;
  const it = project.items.find((i) => i.id === t.id);
  return it ? itemRoom(it, project)?.id ?? null : null;
}

export function insights(project: Project, states: Record<string, HaState>, connected: boolean, pending: Record<string, PendingCommand>): Insight[] {
  const out: Insight[] = [];
  const roomName = (id: string | null) => project.rooms.find((r) => r.id === id)?.name ?? "ohne Raum";
  const openByRoom = new Map<string, string[]>();
  for (const b of project.bindings) {
    const d = describeBinding(b, states, connected);
    const roomId = roomOfBinding(project, b.target);
    if (connected && d.freshness.availability !== "ok") {
      out.push({ key: `avail:${b.entityId}`, tone: "warn", text: `${d.name} (${roomName(roomId)}): ${d.freshness.reason}.`, roomId, target: b.target });
      continue;
    }
    if (b.role === "contact") {
      const c = contactView(d.state);
      if ((c === "open" || c === "tilted") && roomId) openByRoom.set(roomId, [...(openByRoom.get(roomId) ?? []), c === "open" ? "offen" : "gekippt"]);
    }
    if (d.state && b.role === "sensor") {
      const cap = capabilityOf(d.state);
      const n = numericState(d.state);
      if (cap.kind === "sensor" && n !== null) {
        if (cap.quantity === "co2" && n > 1000) out.push({ key: `co2:${b.entityId}`, tone: "info", text: `${roomName(roomId)}: CO₂ bei ${Math.round(n)} ppm – Lüften empfohlen.`, roomId, target: null });
        if (cap.quantity === "humidity" && n > 70) out.push({ key: `hum:${b.entityId}`, tone: "info", text: `${roomName(roomId)}: Luftfeuchte ${Math.round(n)} % – erhöhte Feuchtigkeit.`, roomId, target: null });
      }
    }
  }
  for (const [roomId, states_] of openByRoom) {
    const heating = project.bindings.some((b) => {
      if (b.role !== "climate" || roomOfBinding(project, b.target) !== roomId) return false;
      const v = climateView(states[b.entityId]);
      return v.mode !== null && v.mode !== "off" && v.action === "heating";
    });
    out.push({
      key: `open:${roomId}`,
      tone: heating ? "warn" : "info",
      text: `${roomName(roomId)}: Fenster ${states_.join(" und ")}${heating ? " – die Heizung heizt gleichzeitig." : "."}`,
      roomId,
      target: null,
    });
  }
  for (const p of Object.values(pending)) {
    if (p.phase === "timeout" || p.phase === "failed") {
      const b = project.bindings.find((x) => x.entityId === p.entityId);
      out.push({ key: `cmd:${p.id}`, tone: "warn", text: `${p.label} für ${p.entityId}: ${p.phase === "failed" ? `fehlgeschlagen (${p.error})` : "keine Bestätigung erhalten"}.`, roomId: null, target: b?.target ?? null });
    }
  }
  return out;
}
