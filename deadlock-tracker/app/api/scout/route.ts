import { NextResponse } from "next/server";
import { getLive } from "@/lib/sync";
import { getStore } from "@/lib/store";
import { scout } from "@/lib/scout";

export const dynamic = "force-dynamic";

/**
 * Scouting:
 *  mode=live    laufendes Match des Accounts (nur wenn es im Zuschauer-Tab des Spiels auftaucht – Top 200)
 *  mode=last    Lobby des zuletzt gespielten Matches (aus den gespeicherten Details)
 *  mode=player  ein beliebiger Spieler (id=…)
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const mode = sp.get("mode") ?? "live";
  const account = Number(sp.get("account")) || 0;
  try {
    if (mode === "live") {
      const m = account ? getLive(account) : null;
      if (!m) return NextResponse.json({ kind: "live", active: false });
      const r = await scout(m.players.map((p) => ({ accountId: p.accountId, heroId: p.heroId, team: p.team })), account);
      return NextResponse.json({ kind: "live", active: true, match: { id: m.matchId, durationS: m.durationS, startTime: m.startTime, mode: m.mode, netWorth: m.netWorth, objectives: m.objectives }, ...r });
    }
    if (mode === "last") {
      const recs = Object.values(getStore().matches).filter((x) => x.details && x.history[String(account)]).sort((a, b) => b.startTime - a.startTime);
      const rec = recs[0];
      if (!rec?.details) return NextResponse.json({ kind: "last", available: false });
      const d = rec.details;
      const r = await scout(d.players.map((p) => ({ accountId: p.accountId, heroId: p.heroId, team: p.team, name: p.name, avatar: p.avatar })), account);
      return NextResponse.json({ kind: "last", available: true, match: { id: d.matchId, durationS: d.durationS, startTime: d.startTime, mode: d.matchMode, winningTeam: d.winningTeam }, ...r });
    }
    const id = Number(sp.get("id"));
    if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });
    const r = await scout([{ accountId: id, heroId: 0, team: 0 }], undefined);
    return NextResponse.json({ kind: "player", ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
