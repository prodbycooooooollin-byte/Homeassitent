import { NextResponse } from "next/server";
import { listMatches, overview } from "@/lib/view";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const account = Number(new URL(req.url).searchParams.get("account"));
  if (!account) return NextResponse.json({ error: "account fehlt" }, { status: 400 });
  const matches = listMatches(account);
  return NextResponse.json({ matches, overview: overview(matches) });
}
