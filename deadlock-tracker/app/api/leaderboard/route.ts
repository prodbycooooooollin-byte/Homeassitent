import { NextResponse } from "next/server";
import { fetchLeaderboard } from "@/lib/api";

export const dynamic = "force-dynamic";

const REGIONS = ["Europe", "NAmerica", "Asia", "SAmerica", "Oceania"];
const cache = new Map<string, { at: number; rows: Awaited<ReturnType<typeof fetchLeaderboard>> }>();

export async function GET(req: Request) {
  const region = new URL(req.url).searchParams.get("region") ?? "Europe";
  if (!REGIONS.includes(region)) return NextResponse.json({ error: "Region unbekannt" }, { status: 400 });
  const hit = cache.get(region);
  try {
    if (!hit || Date.now() - hit.at > 30 * 60_000) cache.set(region, { at: Date.now(), rows: await fetchLeaderboard(region) });
    return NextResponse.json({ rows: cache.get(region)!.rows });
  } catch (e) {
    if (hit) return NextResponse.json({ rows: hit.rows, stale: true });
    return NextResponse.json({ rows: [], error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
