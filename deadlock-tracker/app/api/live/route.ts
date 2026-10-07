import { NextResponse } from "next/server";
import { getLive, liveStatus } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const account = Number(new URL(req.url).searchParams.get("account"));
  return NextResponse.json({ match: account ? getLive(account) : null, ...liveStatus() });
}
