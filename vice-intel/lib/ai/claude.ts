/**
 * Claude integration (server-only).
 *
 * - Answers stream from retrieved records only, with record-id citations.
 * - Screenshot recognition returns schema-validated JSON; catalog ids that the
 *   model returns are re-validated against the knowledge base before use.
 * - Server-side refusal fallbacks are enabled (`fallbacks: "default"`).
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { getAll } from "@/lib/content/repository";
import { serializeRecord, type Retrieval } from "./retrieval";

export const MODEL = process.env.VICE_INTEL_MODEL || "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 1, timeout: 60_000 });
  return client;
}

/* ------------------------------------------------------------------ */
/* Ask                                                                 */
/* ------------------------------------------------------------------ */

// Frozen system prompt: keep byte-stable so it stays cacheable.
const ASK_SYSTEM = `You are VICE INTEL, an unofficial companion for the video game Grand Theft Auto VI. Players read your answers on a phone next to their console, mid-game.

Answer ONLY from the <record> blocks in the user's message. Never use outside knowledge about GTA VI or any other game, and never guess game facts.

Rules:
- Lead with the direct answer in one or two sentences, then at most a short list of steps or requirements. Keep it under 140 words.
- Cite every fact with the record id in square brackets, e.g. [unlock:demo-vortex-gt].
- Every record has a status. "official" = Rockstar pre-release material (say in-game details may differ). "demo" = sample data that is NOT real game information: if your answer relies on a demo record, say once that it is demo data. "theory"/"unverified" claims must be labelled as such, never stated as fact. "estimate" values must be called estimates.
- If the records do not answer the question, say plainly that VICE INTEL has no reliable information on it yet and suggest what to search for instead. Do not fill gaps.
- When the player is stuck on a mission objective, focus only on that objective: what to do, the common failure point, one alternative.
- Respect spoilers: do not reveal content from steps or objectives marked (spoiler) unless the player's question is explicitly about them.
- Plain text with **bold** and "- " lists only. No headings, no tables.`;

export async function* streamAnswer(query: string, retrieval: Retrieval, signal?: AbortSignal): AsyncGenerator<string> {
  const recordText = retrieval.records
    .map((r) => serializeRecord(r, retrieval.focus?.entity.id === r.id ? retrieval.focus.objectiveId : undefined))
    .join("\n\n");
  const focusLine = retrieval.focus
    ? `\nThe player is viewing ${retrieval.focus.entity.id}${retrieval.focus.objectiveId ? ` and is stuck at objective [${retrieval.focus.objectiveId}]` : ""}.`
    : "";

  const stream = getClient().beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 2000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [{ type: "text", text: ASK_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `<records>\n${recordText || "(no records matched)"}\n</records>${focusLine}\n\nPlayer question: ${query}`,
        },
      ],
    },
    { signal },
  );

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw new AIRefusalError();
}

export class AIRefusalError extends Error {
  constructor() {
    super("The model declined to answer this request.");
  }
}

/* ------------------------------------------------------------------ */
/* Scan                                                                */
/* ------------------------------------------------------------------ */

export const ScanResultSchema = z.object({
  isGameScreenshot: z.boolean(),
  sceneDescription: z.string(),
  detections: z.array(
    z.object({
      label: z.string(),
      category: z.enum(["vehicle", "weapon", "location", "mission", "clothing", "character", "easter-egg", "object", "ui-text", "other"]),
      catalogId: z.string().nullable(),
      confidence: z.number(),
      evidence: z.string(),
    }),
  ),
  visibleText: z.array(z.string()),
  suggestedQueries: z.array(z.string()),
});
export type ScanModelResult = z.infer<typeof ScanResultSchema>;

function catalogDigest(): string {
  return getAll()
    .map((e) => `${e.id} | ${e.title} | ${[...e.aliases, ...e.tags].slice(0, 6).join(", ")}`)
    .join("\n");
}

const SCAN_SYSTEM = `You identify what is visible in a player's screenshot or phone photo of a TV showing Grand Theft Auto VI, to help them find guides.

Be honest about uncertainty:
- Describe only what is actually visible. Never claim to recognise a specific in-game model, mission or location unless visible evidence (HUD text, signage, distinctive shape) supports it.
- confidence is 0–1 and must reflect real uncertainty. Photos of screens are often blurry or angled: lower confidence accordingly.
- catalogId: set ONLY to an id from the provided catalog when the detection plausibly matches that entry; otherwise null. Do not invent ids.
- If the image is not from a video game, set isGameScreenshot to false.
- suggestedQueries: 1–4 short searches the player could run, based on what is visible.`;

export async function scanImage(bytes: Uint8Array, mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif", signal?: AbortSignal) {
  const response = await getClient().beta.messages.parse(
    {
      model: MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "medium", format: zodOutputFormat(ScanResultSchema) },
      system: [
        { type: "text", text: SCAN_SYSTEM },
        { type: "text", text: `Catalog (id | title | keywords):\n${catalogDigest()}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: Buffer.from(bytes).toString("base64") } },
            { type: "text", text: "Identify what is visible in this image." },
          ],
        },
      ],
    },
    { signal },
  );
  if (response.stop_reason === "refusal") throw new AIRefusalError();
  if (!response.parsed_output) throw new Error("Recognition returned an unreadable result.");
  return response.parsed_output;
}

export { Anthropic };
