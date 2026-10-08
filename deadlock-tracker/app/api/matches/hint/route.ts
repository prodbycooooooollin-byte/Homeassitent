import { NextResponse } from "next/server";
import { hintMatch } from "@/lib/sync";

export const dynamic = "force-dynamic";

/** Hinweis der Desktop-App: Match <id> ist gerade zu Ende gegangen (Steam-Cache, Ingest-Protokoll) – wird im Hintergrund geladen, sobald verfügbar. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { matchId?: number; source?: string };
  const id = Number(b.matchId);
  if (!Number.isInteger(id) || id < 1e6 || id > 1e11) return NextResponse.json({ ok: false, error: "ungültige Match-ID" }, { status: 400 });
  return NextResponse.json({ ok: true, added: hintMatch(id, String(b.source ?? "app").slice(0, 20)) });
}
