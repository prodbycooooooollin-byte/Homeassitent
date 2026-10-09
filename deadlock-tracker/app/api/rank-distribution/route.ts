import { NextResponse } from "next/server";
import { fetchBadgeDistribution } from "@/lib/api";
import { badgeToLinear } from "@/lib/ranks";

export const dynamic = "force-dynamic";
let cache: { at: number; rows: { badge: number; players: number }[] } | null = null;

export async function GET(req: Request) {
  const mine = Number(new URL(req.url).searchParams.get("badge")) || 0;
  try {
    if (!cache || Date.now() - cache.at > 3600_000) cache = { at: Date.now(), rows: await fetchBadgeDistribution() };
  } catch (e) {
    if (!cache) return NextResponse.json({ rows: [], error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  const rows = cache!.rows;
  const total = rows.reduce((a, r) => a + r.players, 0);
  const me = badgeToLinear(mine);
  const below = me === null ? 0 : rows.filter((r) => (badgeToLinear(r.badge) ?? 0) < me).reduce((a, r) => a + r.players, 0);
  const same = me === null ? 0 : rows.filter((r) => badgeToLinear(r.badge) === me).reduce((a, r) => a + r.players, 0);
  // Perzentil: Anteil der Spieler mit niedrigerem Rang (+ halbe Gleichstände)
  const percentile = total && me !== null ? ((below + same / 2) / total) * 100 : null;
  return NextResponse.json({ rows, total, percentile });
}
