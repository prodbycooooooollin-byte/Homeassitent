import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { heroAggregates, listMatches, overview } from "@/lib/view";
import { radar } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const a = Number(sp.get("a")), b = Number(sp.get("b"));
  const store = getStore();
  if (!store.players[String(a)] || !store.players[String(b)]) return NextResponse.json({ error: "Beide Accounts müssen getrackt sein" }, { status: 400 });
  const side = (id: number) => {
    const items = listMatches(id);
    const mins = items.reduce((x, m) => x + m.durationS / 60, 0) || 1;
    const n = items.length || 1;
    return {
      player: store.players[String(id)],
      overview: overview(items, id),
      heroes: heroAggregates(items).slice(0, 6),
      radar: radar(items, 30),
      avg: {
        kills: items.reduce((x, m) => x + m.kills, 0) / n, deaths: items.reduce((x, m) => x + m.deaths, 0) / n, assists: items.reduce((x, m) => x + m.assists, 0) / n,
        soulsPerMin: items.reduce((x, m) => x + m.netWorth, 0) / mins, minutes: mins / n,
        last10Wr: items.slice(0, 10).length ? items.slice(0, 10).filter((m) => m.won).length / items.slice(0, 10).length : 0,
      },
    };
  };
  // Gemeinsame Matches (beide Accounts in den Details): zusammen bzw. gegeneinander
  const shared: { matchId: number; startTime: number; together: boolean; aWon: boolean; aHero: number; bHero: number }[] = [];
  for (const rec of Object.values(store.matches)) {
    const d = rec.details;
    const pa = d?.players.find((p) => p.accountId === a), pb = d?.players.find((p) => p.accountId === b);
    if (!d || !pa || !pb) continue;
    shared.push({ matchId: rec.matchId, startTime: rec.startTime, together: pa.team === pb.team, aWon: d.winningTeam === pa.team, aHero: pa.heroId, bHero: pb.heroId });
  }
  shared.sort((x, y) => y.startTime - x.startTime);
  const together = shared.filter((s) => s.together), against = shared.filter((s) => !s.together);
  return NextResponse.json({
    a: side(a), b: side(b),
    shared: { list: shared.slice(0, 20), together: { games: together.length, wins: together.filter((s) => s.aWon).length }, against: { games: against.length, aWins: against.filter((s) => s.aWon).length } },
  });
}
