import { NextResponse } from "next/server";
import { runCycle } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(await runCycle(true));
}
