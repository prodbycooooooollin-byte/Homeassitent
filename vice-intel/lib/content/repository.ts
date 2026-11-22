/**
 * Content repository — the single access point for knowledge-base records.
 *
 * Today records live in typed files under /content and are validated at load.
 * The public API (getAll / getById / getBySlug / related / ...) is the seam
 * for swapping in PostgreSQL or a headless CMS later without touching pages,
 * search or the AI layer.
 */
import { demoRecords } from "@/content/demo";
import { officialRecords } from "@/content/official";
import { sources as sourceList } from "@/content/sources";
import { mediaOverrides } from "@/content/media-overrides";
import {
  entitySchema,
  sourceSchema,
  type Entity,
  type EntityKind,
  type EntityOfKind,
  type Source,
  type VerificationStatus,
} from "./schema";

export interface IntegrityIssue {
  level: "error" | "warning";
  recordId: string;
  message: string;
}

interface Store {
  all: Entity[];
  byId: Map<string, Entity>;
  bySlug: Map<string, Entity>;
  backlinks: Map<string, Set<string>>;
  sources: Map<string, Source>;
  issues: IntegrityIssue[];
}

let store: Store | null = null;

function build(): Store {
  const issues: IntegrityIssue[] = [];
  const all: Entity[] = [];

  for (const base of [...officialRecords, ...demoRecords]) {
    const extra = mediaOverrides[(base as { id: string }).id];
    const raw = extra ? { ...base, media: [...extra, ...((base as { media?: unknown[] }).media ?? [])] } : base;
    const parsed = entitySchema.safeParse(raw);
    if (!parsed.success) {
      const id = (raw as { id?: string }).id ?? "unknown";
      issues.push({
        level: "error",
        recordId: id,
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
      continue;
    }
    all.push(parsed.data);
  }

  const sources = new Map<string, Source>();
  for (const s of sourceList) {
    const parsed = sourceSchema.safeParse(s);
    if (parsed.success) sources.set(parsed.data.id, parsed.data);
    else issues.push({ level: "error", recordId: `source:${s.id}`, message: parsed.error.message });
  }

  const byId = new Map<string, Entity>();
  const bySlug = new Map<string, Entity>();
  for (const e of all) {
    if (byId.has(e.id)) issues.push({ level: "error", recordId: e.id, message: "duplicate id" });
    const slugKey = `${e.kind}/${e.slug}`;
    if (bySlug.has(slugKey)) issues.push({ level: "error", recordId: e.id, message: "duplicate slug" });
    byId.set(e.id, e);
    bySlug.set(slugKey, e);
  }

  for (const id of Object.keys(mediaOverrides)) {
    if (!byId.has(id)) issues.push({ level: "error", recordId: id, message: "media override for unknown record" });
  }

  const backlinks = new Map<string, Set<string>>();
  const link = (from: string, to: string) => {
    if (!backlinks.has(to)) backlinks.set(to, new Set());
    backlinks.get(to)!.add(from);
  };

  for (const e of all) {
    const refs = collectRefs(e);
    for (const ref of refs) {
      if (!byId.has(ref)) issues.push({ level: "error", recordId: e.id, message: `broken reference → ${ref}` });
      else link(e.id, ref);
    }
    for (const s of e.sources) {
      if (!sources.has(s)) issues.push({ level: "error", recordId: e.id, message: `unknown source → ${s}` });
    }
    if (e.verification.status !== "demo" && e.sources.length === 0) {
      issues.push({ level: "warning", recordId: e.id, message: "non-demo record without sources" });
    }
    if (e.verification.status === "verified" && !e.verification.checkedAt) {
      issues.push({ level: "warning", recordId: e.id, message: "verified record without checkedAt date" });
    }
    if (e.media.every((m) => !m.src)) {
      issues.push({ level: "warning", recordId: e.id, message: "uses illustration only (no licensed image yet)" });
    }
  }

  return { all, byId, bySlug, backlinks, sources, issues };
}

/** Every record id referenced by an entity (related, location, requirement refs). */
export function collectRefs(e: Entity): string[] {
  const refs = new Set<string>(e.related);
  if (e.locationId) refs.add(e.locationId);
  const reqs =
    e.kind === "mission" || e.kind === "unlock" || e.kind === "money"
      ? e.requirements
      : e.kind === "easter-egg"
        ? e.conditions
        : [];
  for (const r of reqs) if (r.ref) refs.add(r.ref);
  refs.delete(e.id);
  return [...refs];
}

function s(): Store {
  if (!store) store = build();
  return store;
}

/* ---------------------------- public API ---------------------------- */

export const KIND_ROUTE: Record<EntityKind, string> = {
  mission: "missions",
  unlock: "unlocks",
  "easter-egg": "easter-eggs",
  money: "money",
  location: "locations",
  character: "characters",
};

export function hrefFor(e: Pick<Entity, "kind" | "slug">): string {
  return `/${KIND_ROUTE[e.kind]}/${e.slug}`;
}

export function getAll(): Entity[] {
  return s().all;
}

export function getByKind<K extends EntityKind>(kind: K): EntityOfKind<K>[] {
  return s().all.filter((e): e is EntityOfKind<K> => e.kind === kind);
}

export function getById(id: string): Entity | undefined {
  return s().byId.get(id);
}

export function getBySlug<K extends EntityKind>(kind: K, slug: string): EntityOfKind<K> | undefined {
  return s().bySlug.get(`${kind}/${slug}`) as EntityOfKind<K> | undefined;
}

export function getSource(id: string): Source | undefined {
  return s().sources.get(id);
}

export function getSources(ids: string[]): Source[] {
  return ids.map((id) => s().sources.get(id)).filter((x): x is Source => Boolean(x));
}

/** Explicit relations first, then records that link back to this one. */
export function getRelated(e: Entity, limit = 8): Entity[] {
  const seen = new Set<string>([e.id]);
  const out: Entity[] = [];
  const push = (id: string) => {
    if (seen.has(id)) return;
    const r = s().byId.get(id);
    if (r) {
      seen.add(id);
      out.push(r);
    }
  };
  e.related.forEach(push);
  s().backlinks.get(e.id)?.forEach(push);
  return out.slice(0, limit);
}

/** Records located in a given location (by locationId). */
export function getInLocation(locationId: string): Entity[] {
  return s().all.filter((e) => e.locationId === locationId);
}

export function getIssues(): IntegrityIssue[] {
  return s().issues;
}

export function statusCounts(): Record<VerificationStatus, number> {
  const counts = { verified: 0, official: 0, estimate: 0, theory: 0, unverified: 0, demo: 0, unknown: 0 };
  for (const e of s().all) counts[e.verification.status]++;
  return counts;
}

/** For tests: rebuild from source files. */
export function __reset() {
  store = null;
}
