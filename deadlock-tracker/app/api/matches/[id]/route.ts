import { NextResponse } from "next/server";
import { enrichMatch } from "@/lib/sync";
import { getStore } from "@/lib/store";
import { lobbyBadge } from "@/lib/view";
import { ratePlayer } from "@/lib/rating";
import { cachedHeroRole } from "@/lib/hero-roles-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const matchId = Number(params.id);
  const account = Number(new URL(req.url).searchParams.get("account")) || 0;
  const rec = getStore().matches[matchId];
  if (!rec) return NextResponse.json({ error: "Match unbekannt" }, { status: 404 });
  // ?peek=1: nur vorhandene Daten liefern (Hover-Vorschau), keine Netzwerk-Abrufe auslösen
  if (!rec.details && !new URL(req.url).searchParams.has("peek")) await enrichMatch(matchId);
  const d = rec.details;
  const ratings = d ? Object.fromEntries(d.players.map((p) => [p.accountId, ratePlayer(d, p.accountId, cachedHeroRole)])) : {};
  return NextResponse.json({
    matchId,
    details: d ?? null,
    history: rec.history,
    ratings,
    lobbyBadge: lobbyBadge(d),
    pending: !d,
    attempts: rec.detailsAttempts,
    lastError: rec.lastError ?? null,
    nextAttemptAt: rec.nextDetailsAttemptAt < Number.MAX_SAFE_INTEGER ? rec.nextDetailsAttemptAt : null,
    account,
  });
}
