/**
 * Deterministic answer composer — used when the AI model is not configured,
 * rate-limited or unavailable. It never invents anything: it restates fields of
 * the retrieved records in a focused, intent-appropriate shape.
 */
import { getById } from "@/lib/content/repository";
import type { Entity, MoneyActivity } from "@/lib/content/schema";
import type { Retrieval } from "./retrieval";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

function cite(e: Entity) {
  return ` [${e.id}]`;
}

function reqList(rs: { label: string }[]): string {
  return rs.map((r) => `- ${r.label}`).join("\n");
}

export function composeAnswer(query: string, r: Retrieval): string {
  const { records, intent, focus } = r;
  if (records.length === 0) {
    return `I couldn't find anything in the VICE INTEL knowledge base for “${query}”. Try different words, a category filter, or Intel Scan with a screenshot.`;
  }

  const out: string[] = [];

  // Focused mission help: a specific objective was selected.
  if (focus?.entity.kind === "mission") {
    const m = focus.entity;
    const o = m.objectives.find((x) => x.id === focus.objectiveId) ?? m.objectives[0];
    out.push(`**${m.title} → ${o.title}**${cite(m)}`);
    o.steps.forEach((s, i) => out.push(`${i + 1}. **${s.title}** — ${s.detail}${s.tip ? ` _Tip: ${s.tip}_` : ""}`));
    if (o.failurePoints.length) out.push(`\n**Common failure points**\n${o.failurePoints.map((x) => `- ${x}`).join("\n")}`);
    if (o.alternatives.length) out.push(`\n**Alternative approach**\n${o.alternatives.map((x) => `- ${x}`).join("\n")}`);
    return out.join("\n");
  }

  const top = records[0];

  if (intent.intent === "money") {
    const acts = records.filter((e): e is MoneyActivity => e.kind === "money").slice(0, 4);
    if (acts.length) {
      out.push("**Money activities in the knowledge base that match:**");
      for (const a of acts) {
        out.push(
          `- **${a.title}** — ${money(a.payout.min)}–${money(a.payout.max)} per run, ${a.duration.min}–${a.duration.max} min, ${a.progression} game (${a.payout.status})${cite(a)}`,
        );
      }
      out.push("\nCompare them side by side in Money Intel.");
      return out.join("\n");
    }
  }

  switch (top.kind) {
    case "unlock":
      out.push(`**${top.title}** — ${top.howTo}${cite(top)}`);
      if (top.requirements.length) out.push(`\n**Requirements**\n${reqList(top.requirements)}`);
      if (top.price) out.push(`\n**Price:** ${top.price.value}`);
      break;
    case "easter-egg":
      out.push(`**${top.title}** — ${top.summary}${cite(top)}`);
      if (top.locationId) out.push(`**Where:** ${getById(top.locationId)?.title ?? "see map"}`);
      if (top.conditions.length) out.push(`\n**Conditions**\n${reqList(top.conditions)}`);
      if (top.steps.length) out.push(`\n**Steps**\n${top.steps.map((s, i) => `${i + 1}. ${s.title} — ${s.detail}`).join("\n")}`);
      break;
    case "mission":
      out.push(`**${top.title}** — ${top.summary}${cite(top)}`);
      out.push(`**Starts at:** ${top.startLocation}`);
      out.push(`\n**Objectives**\n${top.objectives.map((o, i) => `${i + 1}. ${o.title}`).join("\n")}`);
      out.push("\nOpen the mission and pick the objective you're stuck on for focused help.");
      break;
    case "money":
      out.push(
        `**${top.title}** — ${top.summary}${cite(top)}\n- Payout: ${money(top.payout.min)}–${money(top.payout.max)} (${top.payout.status})\n- Time: ${top.duration.min}–${top.duration.max} min`,
      );
      break;
    case "location":
      out.push(`**${top.title}** — ${top.summary}${cite(top)}`);
      out.push(`${top.character}`);
      break;
    case "character":
      out.push(`**${top.title}** — ${top.summary}${cite(top)}`);
      break;
  }

  const others = records.slice(1, 4);
  if (others.length) out.push(`\n**Also relevant:** ${others.map((e) => `${e.title}${cite(e)}`).join(", ")}`);
  return out.join("\n");
}
