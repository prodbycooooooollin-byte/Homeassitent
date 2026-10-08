import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { isDemo } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = getStore();
  return NextResponse.json({
    demo: isDemo(),
    pollIntervalS: Math.max(5, Number(process.env.POLL_INTERVAL_S) || 20),
    coverage: { total: Object.keys(s.matches).length, withDetails: Object.values(s.matches).filter((m) => m.details && m.details.v === 3).length },
    pendingDetails: Object.values(s.matches).filter((m) => !m.details && m.nextDetailsAttemptAt < Number.MAX_SAFE_INTEGER).length,
    players: Object.values(s.players),
    /** Zuletzt live erkannte Matches (für Benachrichtigungen) */
    live: Object.values(s.matches)
      .filter((m) => m.detectedLive && Object.keys(m.history).some((a) => !s.players[a]?.guest))
      .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
      .slice(0, 10)
      .map((m) => ({ matchId: m.matchId, firstSeenAt: m.firstSeenAt, accounts: Object.keys(m.history).filter((a) => !s.players[a]?.guest).map(Number) })),
  });
}
