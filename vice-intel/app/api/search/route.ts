import { NextResponse } from "next/server";
import { z } from "zod";
import { getById } from "@/lib/content/repository";
import { ENTITY_KINDS } from "@/lib/content/schema";
import { toSourceCard } from "@/lib/ai/retrieval";
import { search } from "@/lib/search/engine";
import { INTENT_LABEL } from "@/lib/search/intent";

export const runtime = "nodejs";

const Query = z.object({
  q: z.string().trim().min(1).max(200),
  kinds: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter((k): k is (typeof ENTITY_KINDS)[number] => (ENTITY_KINDS as readonly string[]).includes(k)) : undefined)),
  prefix: z.enum(["0", "1"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  const { q, kinds, prefix, limit } = parsed.data;
  const res = search(q, { kinds, prefix: prefix === "1", limit: limit ?? 24 });
  return NextResponse.json(
    {
      query: q,
      intent: { ...res.intent, label: INTENT_LABEL[res.intent.intent] },
      didYouMean: res.didYouMean,
      total: res.total,
      results: res.hits.map((h) => ({ ...toSourceCard(getById(h.id)!), score: Math.round(h.score * 100) / 100 })),
    },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } },
  );
}
