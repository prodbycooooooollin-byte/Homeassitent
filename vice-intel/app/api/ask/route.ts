/**
 * POST /api/ask — universal AI assistance over the knowledge base.
 * Response: NDJSON stream of events
 *   {type:"meta", mode, intent, sources[]}  → {type:"delta", text}* → {type:"done"} | {type:"error", message}
 * mode = "ai" (Claude, grounded in retrieved records) or "retrieval" (deterministic, no model).
 */
import { z } from "zod";
import { AIRefusalError, aiConfigured, streamAnswer } from "@/lib/ai/claude";
import { composeAnswer } from "@/lib/ai/compose";
import { retrieve, toSourceCard } from "@/lib/ai/retrieval";
import { TTLCache } from "@/lib/server/cache";
import { clientKey, createRateLimiter } from "@/lib/server/rate-limit";
import { INTENT_LABEL } from "@/lib/search/intent";
import { normalize } from "@/lib/search/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  query: z.string().trim().min(2).max(400),
  context: z
    .object({
      entityId: z.string().max(120).optional(),
      objectiveId: z.string().max(60).optional(),
    })
    .optional(),
});

const limiter = createRateLimiter({ limit: Number(process.env.VICE_INTEL_ASK_LIMIT_PER_MIN ?? 12), windowMs: 60_000 });
const cache = new TTLCache<string>(500, 60 * 60 * 1000);

type Event =
  | { type: "meta"; mode: "ai" | "retrieval"; reason?: string; intent: string; sources: ReturnType<typeof toSourceCard>[]; cached?: boolean }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_request", message: "Send { query: string } (2–400 characters)." }, { status: 400 });
  }

  const retrieval = retrieve(body.query, body.context);
  const sources = retrieval.records.map(toSourceCard);
  const intent = INTENT_LABEL[retrieval.intent.intent];
  const cacheKey = `${normalize(body.query)}|${body.context?.entityId ?? ""}|${body.context?.objectiveId ?? ""}`;

  const rl = limiter(clientKey(req));
  let mode: "ai" | "retrieval" = "retrieval";
  let reason: string | undefined;
  if (!aiConfigured()) reason = "ai_not_configured";
  else if (retrieval.records.length === 0) reason = "no_records";
  else if (!rl.ok) reason = "rate_limited";
  else mode = "ai";

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: Event) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      const cached = mode === "ai" ? cache.get(cacheKey) : undefined;

      if (mode === "retrieval" || cached) {
        send({ type: "meta", mode: cached ? "ai" : "retrieval", reason, intent, sources, cached: Boolean(cached) });
        send({ type: "delta", text: cached ?? composeAnswer(body.query, retrieval) });
        send({ type: "done" });
        controller.close();
        return;
      }

      send({ type: "meta", mode: "ai", intent, sources });
      let full = "";
      try {
        for await (const text of streamAnswer(body.query, retrieval, req.signal)) {
          full += text;
          send({ type: "delta", text });
        }
        cache.set(cacheKey, full);
        send({ type: "done" });
      } catch (err) {
        if (req.signal.aborted) {
          controller.close();
          return;
        }
        console.error("[ask] AI error", err instanceof Error ? err.message : err);
        // Graceful degradation: fall back to the deterministic answer.
        const fallback = composeAnswer(body.query, retrieval);
        send({
          type: "error",
          message:
            err instanceof AIRefusalError
              ? "The AI declined this request. Showing knowledge-base results instead."
              : "The AI is unavailable right now. Showing knowledge-base results instead.",
        });
        send({ type: "delta", text: (full ? "\n\n" : "") + fallback });
        send({ type: "done" });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-RateLimit-Remaining": String(rl.remaining),
    },
  });
}
