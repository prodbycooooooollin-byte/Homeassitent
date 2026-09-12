import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { getLivePlayerPositions } from "@/lib/queries/map";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiUser();
  if (!("user" in auth)) return auth.response;

  const players = await getLivePlayerPositions();
  return NextResponse.json({ players });
}
