// Validierung des versionierten Projektformats (Import, Laden, Server).
// Unbekannte Felder werden verworfen – so gelangen keine fremden Daten
// (z. B. versehentlich eingefügte Zugangsdaten) ins Projekt.
import { z } from "zod";
import { PROJECT_FORMAT, PROJECT_FORMAT_VERSION, type Project, type ProjectFile } from "./types";

const id = z.string().min(1).max(80);
const num = z.number().finite();
const len = (min: number, max: number) => num.min(min).max(max);

const vertex = z.object({ id, x: len(-500, 500), y: len(-500, 500) });

const floor = z.object({
  id,
  name: z.string().max(60),
  elevation: len(-20, 200),
  height: len(1.8, 8),
});

const room = z.object({
  id,
  floorId: id,
  name: z.string().max(60),
  vertices: z.array(vertex).min(3).max(200),
  floorMaterial: z.enum(["oak", "walnut", "tiles", "stone", "carpet", "concrete"]),
  wallColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  openEdges: z.array(id).default([]),
});

const opening = z.object({
  id,
  roomId: id,
  edgeStart: id,
  offset: len(0, 500),
  width: len(0.2, 20),
  height: len(0.2, 8),
  sill: len(0, 6),
  kind: z.enum(["door", "window", "passage"]),
  hinge: z.enum(["left", "right"]).default("left"),
});

const floorVoid = z.object({
  id,
  floorId: id,
  name: z.string().max(60),
  x: len(-500, 500),
  y: len(-500, 500),
  width: len(0.3, 30),
  depth: len(0.3, 30),
});

const item = z.object({
  id,
  floorId: id,
  catalogId: z.string().max(80),
  name: z.string().max(80),
  x: len(-500, 500),
  y: len(-500, 500),
  elevation: len(-1, 10),
  rotation: num,
  width: len(0.02, 30),
  depth: len(0.02, 30),
  height: len(0.01, 10),
  material: z.string().max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  acceptedIssues: z.array(z.string().max(40)).default([]),
});

const binding = z.object({
  id,
  entityId: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/),
  target: z.object({ kind: z.enum(["item", "opening", "room"]), id }),
  role: z.enum(["light", "switch", "cover", "contact", "climate", "sensor"]),
  confirmedAt: z.string().max(40),
  via: z.enum(["manual", "suggestion"]),
});

const entityRef = z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/).nullable();

const meter = z.object({
  id,
  label: z.string().max(80),
  flow: z.enum([
    "consumption",
    "grid_import",
    "grid_export",
    "grid_net",
    "pv_production",
    "battery_charge",
    "battery_discharge",
    "battery_net",
  ]),
  powerEntityId: entityRef,
  energyEntityId: entityRef,
  invertPower: z.boolean(),
  isHouseMain: z.boolean(),
  roomId: id.nullable(),
  itemId: id.nullable(),
  parentId: id.nullable(),
  coversWholeRoom: z.boolean(),
});

const underlay = z.object({
  floorId: id,
  assetId: id,
  x: num,
  y: num,
  width: len(0.5, 1000),
  opacity: len(0, 1),
  visible: z.boolean(),
});

const asset = z.object({
  id,
  name: z.string().max(120),
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]),
  data: z.string().startsWith("data:image/").max(15_000_000),
});

export const projectSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
  floors: z.array(floor).min(1).max(20),
  rooms: z.array(room).max(500),
  openings: z.array(opening).max(2000),
  voids: z.array(floorVoid).max(100).default([]),
  items: z.array(item).max(5000),
  bindings: z.array(binding).max(5000),
  meters: z.array(meter).max(1000),
  underlays: z.array(underlay).max(20).default([]),
  assets: z.array(asset).max(20).default([]),
  settings: z
    .object({ gridSize: len(0.01, 1), noLocalGeneration: z.boolean().default(false) })
    .default({ gridSize: 0.1, noLocalGeneration: false }),
});

export const projectFileSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  formatVersion: z.number().int().min(1),
  exportedAt: z.string().max(40),
  project: projectSchema,
});

export type ValidationResult<T> = { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[] };

function formatIssues(err: z.ZodError): string[] {
  return err.issues.slice(0, 12).map((i) => `${i.path.join(".") || "(Datei)"}: ${i.message}`);
}

/** Prüft referenzielle Integrität (IDs, Verweise). */
export function checkReferences(p: Project): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const dup = (x: string) => {
    if (ids.has(x)) errors.push(`Doppelte ID: ${x}`);
    ids.add(x);
  };
  const floorIds = new Set(p.floors.map((f) => f.id));
  p.floors.forEach((f) => dup(f.id));
  const roomById = new Map(p.rooms.map((r) => [r.id, r]));
  for (const r of p.rooms) {
    dup(r.id);
    if (!floorIds.has(r.floorId)) errors.push(`Raum „${r.name}“ verweist auf eine unbekannte Etage.`);
    const vIds = new Set<string>();
    for (const v of r.vertices) {
      if (vIds.has(v.id)) errors.push(`Raum „${r.name}“ hat doppelte Eck-IDs.`);
      vIds.add(v.id);
    }
  }
  for (const o of p.openings) {
    dup(o.id);
    const r = roomById.get(o.roomId);
    if (!r) errors.push(`Öffnung ${o.id} verweist auf einen unbekannten Raum.`);
    else if (!r.vertices.some((v) => v.id === o.edgeStart)) errors.push(`Öffnung ${o.id} verweist auf eine unbekannte Wand.`);
  }
  for (const v of p.voids) {
    dup(v.id);
    if (!floorIds.has(v.floorId)) errors.push(`Deckenöffnung ${v.id} verweist auf eine unbekannte Etage.`);
  }
  const itemIds = new Set<string>();
  for (const it of p.items) {
    dup(it.id);
    itemIds.add(it.id);
    if (!floorIds.has(it.floorId)) errors.push(`Objekt „${it.name}“ verweist auf eine unbekannte Etage.`);
  }
  const openingIds = new Set(p.openings.map((o) => o.id));
  for (const b of p.bindings) {
    dup(b.id);
    const exists =
      b.target.kind === "item" ? itemIds.has(b.target.id) : b.target.kind === "room" ? roomById.has(b.target.id) : openingIds.has(b.target.id);
    if (!exists) warnings.push(`Zuordnung für ${b.entityId} verweist auf ein fehlendes Objekt und wird verworfen.`);
  }
  const meterIds = new Set(p.meters.map((m) => m.id));
  for (const m of p.meters) {
    dup(m.id);
    if (m.parentId && !meterIds.has(m.parentId)) warnings.push(`Messpunkt „${m.label}“: übergeordneter Zähler fehlt, Verknüpfung wird gelöst.`);
    if (m.roomId && !roomById.has(m.roomId)) warnings.push(`Messpunkt „${m.label}“: Raum fehlt, Zuordnung wird gelöst.`);
    if (m.itemId && !itemIds.has(m.itemId)) warnings.push(`Messpunkt „${m.label}“: Objekt fehlt, Zuordnung wird gelöst.`);
  }
  // Zyklen in der Zählerhierarchie
  const byId = new Map(p.meters.map((m) => [m.id, m]));
  for (const m of p.meters) {
    const seen = new Set<string>([m.id]);
    let cur = m.parentId ? byId.get(m.parentId) : undefined;
    while (cur) {
      if (seen.has(cur.id)) {
        errors.push(`Zählerhierarchie enthält einen Kreis bei „${m.label}“.`);
        break;
      }
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
  const assetIds = new Set(p.assets.map((a) => a.id));
  for (const u of p.underlays) {
    if (!assetIds.has(u.assetId)) warnings.push("Ein Grundrissbild fehlt in der Datei und wird ausgeblendet.");
  }
  return { errors, warnings };
}

/** Entfernt hängende Verweise, nachdem checkReferences Warnungen gemeldet hat. */
export function repairReferences(p: Project): Project {
  const itemIds = new Set(p.items.map((i) => i.id));
  const roomIds = new Set(p.rooms.map((r) => r.id));
  const openingIds = new Set(p.openings.map((o) => o.id));
  const meterIds = new Set(p.meters.map((m) => m.id));
  const assetIds = new Set(p.assets.map((a) => a.id));
  return {
    ...p,
    bindings: p.bindings.filter((b) =>
      b.target.kind === "item" ? itemIds.has(b.target.id) : b.target.kind === "room" ? roomIds.has(b.target.id) : openingIds.has(b.target.id),
    ),
    meters: p.meters.map((m) => ({
      ...m,
      parentId: m.parentId && meterIds.has(m.parentId) ? m.parentId : null,
      roomId: m.roomId && roomIds.has(m.roomId) ? m.roomId : null,
      itemId: m.itemId && itemIds.has(m.itemId) ? m.itemId : null,
    })),
    underlays: p.underlays.filter((u) => assetIds.has(u.assetId)),
  };
}

/** Bringt ältere Formatversionen auf den aktuellen Stand. */
export function migrate(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const file = raw as { formatVersion?: number };
  if (typeof file.formatVersion === "number" && file.formatVersion > PROJECT_FORMAT_VERSION) {
    throw new Error(
      `Die Datei stammt aus einer neueren LumaHome-Version (Format ${file.formatVersion}). Unterstützt wird bis Format ${PROJECT_FORMAT_VERSION}.`,
    );
  }
  // Format 1 ist die erste veröffentlichte Version – hier folgen künftige Schritte.
  return raw;
}

export function parseProjectFile(raw: unknown): ValidationResult<ProjectFile> {
  let migrated: unknown;
  try {
    migrated = migrate(raw);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  const res = projectFileSchema.safeParse(migrated);
  if (!res.success) return { ok: false, errors: formatIssues(res.error) };
  const file = res.data as ProjectFile;
  const refs = checkReferences(file.project);
  if (refs.errors.length) return { ok: false, errors: refs.errors };
  return {
    ok: true,
    value: { ...file, formatVersion: PROJECT_FORMAT_VERSION, project: repairReferences(file.project) },
    warnings: refs.warnings,
  };
}

export function parseProject(raw: unknown): ValidationResult<Project> {
  const res = projectSchema.safeParse(raw);
  if (!res.success) return { ok: false, errors: formatIssues(res.error) };
  const refs = checkReferences(res.data as Project);
  if (refs.errors.length) return { ok: false, errors: refs.errors };
  return { ok: true, value: repairReferences(res.data as Project), warnings: refs.warnings };
}

export function toProjectFile(project: Project): ProjectFile {
  return { format: PROJECT_FORMAT, formatVersion: PROJECT_FORMAT_VERSION, exportedAt: new Date().toISOString(), project };
}
