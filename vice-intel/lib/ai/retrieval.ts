/**
 * Retrieval for the AI layer (the "R" in RAG).
 *
 * The model never answers from general knowledge: it receives only the records
 * retrieved here, serialised with their ids and verification status, and must
 * cite them. When nothing relevant is retrieved the answer says so.
 */
import { getById, getRelated, hrefFor } from "@/lib/content/repository";
import type { Entity, VerificationStatus } from "@/lib/content/schema";
import { search } from "@/lib/search/engine";
import type { IntentResult } from "@/lib/search/intent";

export interface AskContext {
  entityId?: string;
  objectiveId?: string;
}

export interface SourceCard {
  id: string;
  title: string;
  kind: Entity["kind"];
  href: string;
  status: VerificationStatus;
  summary: string;
  art?: { scene: string; seed: number };
  src?: string;
}

export interface Retrieval {
  records: Entity[];
  intent: IntentResult;
  focus?: { entity: Entity; objectiveId?: string };
}

export function retrieve(query: string, ctx: AskContext = {}, k = 6): Retrieval {
  const res = search(query, { limit: k + 4 });
  const ids: string[] = [];
  let focus: Retrieval["focus"];

  if (ctx.entityId) {
    const e = getById(ctx.entityId);
    if (e) {
      focus = { entity: e, objectiveId: ctx.objectiveId };
      ids.push(e.id);
    }
  }
  for (const h of res.hits) if (!ids.includes(h.id)) ids.push(h.id);

  // If retrieval is thin, widen with relations of the strongest record.
  const first = ids[0] ? getById(ids[0]) : undefined;
  if (first && ids.length < 3) for (const r of getRelated(first, 4)) if (!ids.includes(r.id)) ids.push(r.id);

  const records = ids
    .slice(0, k)
    .map((id) => getById(id))
    .filter((e): e is Entity => Boolean(e));
  return { records, intent: res.intent, focus };
}

export function toSourceCard(e: Entity): SourceCard {
  const m = e.media[0];
  return {
    id: e.id,
    title: e.title,
    kind: e.kind,
    href: hrefFor(e),
    status: e.verification.status,
    summary: e.summary,
    art: m.art,
    src: m.src,
  };
}

/** Compact, citation-friendly serialisation of a record for the model. */
export function serializeRecord(e: Entity, objectiveId?: string): string {
  const lines: string[] = [`<record id="${e.id}" kind="${e.kind}" status="${e.verification.status}">`, `title: ${e.title}`, `summary: ${e.summary}`];
  if (e.verification.note) lines.push(`verification_note: ${e.verification.note}`);
  if (e.locationId) lines.push(`location: ${getById(e.locationId)?.title ?? e.locationId}`);
  const reqs = (rs: { label: string }[]) => rs.map((r) => `- ${r.label}`).join("\n");

  switch (e.kind) {
    case "mission": {
      lines.push(`start: ${e.startLocation}`);
      if (e.requirements.length) lines.push(`requirements:\n${reqs(e.requirements)}`);
      const objs = objectiveId ? e.objectives.filter((o) => o.id === objectiveId) : e.objectives;
      for (const o of objs) {
        lines.push(`objective [${o.id}] ${o.title}${o.spoiler ? " (spoiler)" : ""}:`);
        o.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s.title} — ${s.detail}${s.tip ? ` (tip: ${s.tip})` : ""}`));
        if (o.failurePoints.length) lines.push(`  failure points: ${o.failurePoints.join(" | ")}`);
        if (o.alternatives.length) lines.push(`  alternatives: ${o.alternatives.join(" | ")}`);
      }
      if (e.rewards.length) lines.push(`rewards: ${e.rewards.map((r) => `${r.label}: ${r.value} [${r.status}]`).join("; ")}`);
      break;
    }
    case "unlock":
      lines.push(`category: ${e.category}`, `how_to: ${e.howTo}`);
      if (e.requirements.length) lines.push(`requirements:\n${reqs(e.requirements)}`);
      if (e.price) lines.push(`price: ${e.price.value} [${e.price.status}]`);
      e.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s.title} — ${s.detail}`));
      break;
    case "easter-egg":
      lines.push(`category: ${e.category}`);
      if (e.conditions.length) lines.push(`conditions:\n${reqs(e.conditions)}`);
      e.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s.title} — ${s.detail}`));
      e.claims.forEach((c) => lines.push(`claim [${c.status}]: ${c.text}`));
      if (e.rewards.length) lines.push(`rewards: ${e.rewards.map((r) => `${r.label}: ${r.value}`).join("; ")}`);
      break;
    case "money":
      lines.push(
        `type: ${e.activityType}`,
        `payout: $${e.payout.min.toLocaleString("en-US")}–$${e.payout.max.toLocaleString("en-US")} [${e.payout.status}]`,
        `duration_minutes: ${e.duration.min}–${e.duration.max} [${e.duration.status}]`,
        `difficulty: ${e.difficulty}; repeatable: ${e.repeatable}; progression: ${e.progression}; startup_cost: $${e.startupCost}`,
      );
      if (e.requirements.length) lines.push(`requirements:\n${reqs(e.requirements)}`);
      if (e.strategy.length) lines.push(`strategy: ${e.strategy.join(" | ")}`);
      break;
    case "location":
      lines.push(`character: ${e.character}`, `highlights: ${e.highlights.join(", ")}`);
      break;
    case "character":
      lines.push(`role: ${e.role}`, `facts: ${e.facts.join(" | ")}`);
      break;
  }
  lines.push(`sources: ${e.sources.join(", ") || "none"}`, "</record>");
  return lines.join("\n");
}
