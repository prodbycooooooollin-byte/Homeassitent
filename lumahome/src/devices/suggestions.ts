// Vorschläge für Gerätezuordnungen. Vorschläge werden nur angezeigt und
// begründet – zugeordnet wird erst nach ausdrücklicher Bestätigung.
import type { BindingRole, BindingTarget, DeviceBinding, Project } from "@/model/types";
import { entryFor } from "@/catalog/catalog";
import { capabilityOf, domainOf, friendlyName, roleForCapability, type Capability } from "./capabilities";
import type { HaRegistry, HaState } from "./ha-types";

export interface EntityCandidate {
  entityId: string;
  name: string;
  capability: Capability;
  role: BindingRole;
  areaName: string | null;
  score: number;
  reasons: string[];
  boundTo: DeviceBinding | null;
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Welche Rollen passen grundsätzlich zu einem Zuordnungsziel? */
export function rolesForTarget(project: Project, target: BindingTarget): BindingRole[] {
  if (target.kind === "room") return ["sensor", "climate", "contact"];
  if (target.kind === "opening") {
    const o = project.openings.find((x) => x.id === target.id);
    return o?.kind === "window" ? ["contact", "cover"] : ["contact"];
  }
  const it = project.items.find((i) => i.id === target.id);
  if (!it) return [];
  const roles = entryFor(it.catalogId).deviceRoles;
  return roles.length ? roles : ["switch"];
}

export function areaNameOf(entityId: string, registry: HaRegistry | null): string | null {
  if (!registry?.available) return null;
  const e = registry.entities.find((x) => x.entity_id === entityId);
  if (!e) return null;
  const areaId = e.area_id ?? registry.devices.find((d) => d.id === e.device_id)?.area_id ?? null;
  return areaId ? registry.areas.find((a) => a.area_id === areaId)?.name ?? null : null;
}

export function targetLabel(project: Project, target: BindingTarget): { name: string; roomName: string | null } {
  if (target.kind === "room") {
    const r = project.rooms.find((x) => x.id === target.id);
    return { name: r?.name ?? "Raum", roomName: r?.name ?? null };
  }
  if (target.kind === "opening") {
    const o = project.openings.find((x) => x.id === target.id);
    const r = o && project.rooms.find((x) => x.id === o.roomId);
    return { name: o?.kind === "window" ? "Fenster" : o?.kind === "door" ? "Tür" : "Durchgang", roomName: r?.name ?? null };
  }
  const it = project.items.find((x) => x.id === target.id);
  return { name: it?.name ?? "Objekt", roomName: null };
}

export function rankCandidates(opts: {
  project: Project;
  target: BindingTarget;
  roomName: string | null;
  states: Record<string, HaState>;
  registry: HaRegistry | null;
  query?: string;
  onlyUnbound?: boolean;
  showAllRoles?: boolean;
}): EntityCandidate[] {
  const { project, target, states, registry } = opts;
  const roles = rolesForTarget(project, target);
  const label = targetLabel(project, target);
  const roomN = opts.roomName ? norm(opts.roomName) : null;
  const itemWords = target.kind === "item" ? norm(label.name).split(" ").filter((w) => w.length > 3) : [];
  const q = opts.query ? norm(opts.query) : "";
  const out: EntityCandidate[] = [];
  for (const s of Object.values(states)) {
    const cap = capabilityOf(s);
    const role = roleForCapability(cap);
    if (!role) continue;
    if (!opts.showAllRoles && !roles.includes(role)) continue;
    // Sensoren am Raum: nur Klimagrößen; Energie wird im Bereich Energie zugeordnet
    if (target.kind === "room" && cap.kind === "sensor" && !["temperature", "humidity", "co2", "illuminance", "pm25", "voc", "pressure"].includes(cap.quantity)) continue;
    const name = friendlyName(s, s.entity_id);
    const nName = norm(name);
    if (q && !nName.includes(q) && !s.entity_id.includes(q)) continue;
    const bound = project.bindings.find((b) => b.entityId === s.entity_id) ?? null;
    if (opts.onlyUnbound && bound) continue;
    const areaName = areaNameOf(s.entity_id, registry);
    let score = 0;
    const reasons: string[] = [];
    if (roomN && areaName && norm(areaName) === roomN) {
      score += 50;
      reasons.push(`Bereich „${areaName}“ in Home Assistant entspricht dem Raum`);
    } else if (roomN && nName.includes(roomN)) {
      score += 30;
      reasons.push(`Name enthält „${opts.roomName}“`);
    }
    const word = itemWords.find((w) => nName.includes(w));
    if (word) {
      score += 20;
      reasons.push(`Name passt zu „${label.name}“`);
    }
    if (roles[0] === role) {
      score += 10;
      reasons.push(`Gerätetyp passt (${domainOf(s.entity_id)})`);
    }
    if (bound) score -= 100;
    out.push({ entityId: s.entity_id, name, capability: cap, role, areaName, score, reasons, boundTo: bound });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "de"));
}
