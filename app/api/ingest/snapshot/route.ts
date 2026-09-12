import { NextResponse } from "next/server";
import { requireAgent } from "@/lib/ingest/auth";
import { snapshotSchema } from "@/lib/ingest/schemas";
import { applySnapshot } from "@/lib/ingest/apply-snapshot";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireAgent(req);
  if ("response" in auth) return auth.response;

  const json = await req.json().catch(() => null);
  if (!json) return NextResponse.json({ error: "Ungültiges JSON." }, { status: 400 });

  const parsed = snapshotSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Nutzdaten.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await applySnapshot(auth.server, parsed.data);
  return NextResponse.json({ ok: true, playersProcessed: parsed.data.players.length });
}
