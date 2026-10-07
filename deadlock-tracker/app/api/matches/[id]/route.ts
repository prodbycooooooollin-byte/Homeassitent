import { NextResponse } from "next/server";
import { enrichMatch } from "@/lib/sync";
import { getStore } from "@/lib/store";
import { getHeroes } from "@/lib/heroes";
import { lobbyBadge } from "@/lib/view";
import { ratePlayer } from "@/lib/rating";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const matchId = Number(params.id);
  const account = Number(new URL(req.url).searchParams.get("account")) || 0;
  const rec = getStore().matches[matchId];
  if (!rec) return NextResponse.json({ error: "Match unbekannt" }, { status: 404 });
  if (!rec.details) await enrichMatch(matchId);
  const d = rec.details;
  const ratings = d ? Object.fromEntries(d.players.map((p) => [p.accountId, ratePlayer(d, p.accountId)])) : {};
  return NextResponse.json({
    matchId,
    details: d ?? null,
    history: rec.history,
    ratings,
    lobbyBadge: lobbyBadge(d),
    pending: !d,
    attempts: rec.detailsAttempts,
    nextAttemptAt: rec.nextDetailsAttemptAt < Number.MAX_SAFE_INTEGER ? rec.nextDetailsAttemptAt : null,
    account,
    heroes: await getHeroes(),
  });
}
