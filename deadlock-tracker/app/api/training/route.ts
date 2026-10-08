import { NextResponse } from "next/server";
import { buildReport } from "@/lib/training-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const account = Number(sp.get("account"));
  if (!account) return NextResponse.json({ error: "account fehlt" }, { status: 400 });
  const n = Math.min(60, Math.max(3, Number(sp.get("n")) || 20));
  const hero = Number(sp.get("hero")) || null;
  return NextResponse.json(await buildReport(account, n, hero));
}
