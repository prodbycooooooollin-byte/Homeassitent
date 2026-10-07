import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { isDemo } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = getStore();
  return NextResponse.json({
    demo: isDemo(),
    pollIntervalS: Math.max(5, Number(process.env.POLL_INTERVAL_S) || 20),
    pendingDetails: Object.values(s.matches).filter((m) => !m.details && m.nextDetailsAttemptAt < Number.MAX_SAFE_INTEGER).length,
    players: Object.values(s.players),
  });
}
