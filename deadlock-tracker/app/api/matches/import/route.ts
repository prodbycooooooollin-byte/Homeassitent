import { NextResponse } from "next/server";
import { importMatchById, parseMatchId } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { input?: string };
  const id = parseMatchId(String(b.input ?? ""));
  if (!id) return NextResponse.json({ ok: false, error: "Keine Match-ID erkannt." }, { status: 400 });
  const r = await importMatchById(id);
  return NextResponse.json({ ...r, matchId: id }, { status: r.ok ? 200 : 422 });
}
