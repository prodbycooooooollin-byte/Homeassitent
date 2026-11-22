/**
 * POST /api/scan — Intel Scan screenshot recognition.
 * multipart/form-data with field "image". Images are processed in memory and never stored.
 * Never simulates recognition: without a configured model it returns mode "unavailable".
 */
import { NextResponse } from "next/server";
import { AIRefusalError, aiConfigured, scanImage } from "@/lib/ai/claude";
import { toSourceCard } from "@/lib/ai/retrieval";
import { getById } from "@/lib/content/repository";
import { clientKey, createRateLimiter } from "@/lib/server/rate-limit";
import { validateImageUpload } from "@/lib/server/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const limiter = createRateLimiter({ limit: Number(process.env.VICE_INTEL_SCAN_LIMIT_PER_MIN ?? 4), windowMs: 60_000 });

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_request", message: "Upload the image as multipart form data." }, { status: 400 });
  }
  const check = await validateImageUpload(form.get("image") as File | null);
  if (!check.ok) return NextResponse.json({ error: check.code, message: check.message }, { status: check.status });

  if (!aiConfigured()) {
    return NextResponse.json({
      mode: "unavailable",
      reason: "ai_not_configured",
      message: "Screenshot recognition isn't configured on this server, so nothing was analysed. Describe what you see instead.",
    });
  }

  const rl = limiter(clientKey(req));
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: `Too many scans. Try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  try {
    const result = await scanImage(check.bytes, check.type, req.signal);
    const detections = result.detections
      .map((d) => {
        const entity = d.catalogId ? getById(d.catalogId) : undefined; // drop ids the model invented
        return {
          label: d.label,
          category: d.category,
          confidence: Math.max(0, Math.min(1, d.confidence)),
          evidence: d.evidence,
          match: entity ? toSourceCard(entity) : null,
        };
      })
      .sort((a, b) => b.confidence - a.confidence);
    return NextResponse.json({
      mode: "ai",
      isGameScreenshot: result.isGameScreenshot,
      sceneDescription: result.sceneDescription,
      detections,
      visibleText: result.visibleText.slice(0, 12),
      suggestedQueries: result.suggestedQueries.slice(0, 4),
    });
  } catch (err) {
    console.error("[scan] error", err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        error: err instanceof AIRefusalError ? "refused" : "ai_error",
        message: "Recognition failed for this image. Try a sharper screenshot, or search manually.",
      },
      { status: 502 },
    );
  }
}
