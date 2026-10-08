import { NextResponse } from "next/server";
import { fetchCounters } from "@/lib/api";
import type { MatchupRow } from "@/lib/counter";

export const dynamic = "force-dynamic";

const TTL = 30 * 60_000;
const cache = new Map<number, { at: number; rows: MatchupRow[] }>();

/** GET /api/counter-picker?heroes=1,2,3 -> { matchups: { [gegnerId]: MatchupRow[] } } (je Gegner 30 Min. gecacht). */
export async function GET(req: Request) {
  const ids = [...new Set((new URL(req.url).searchParams.get("heroes") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 6);
  if (!ids.length) return NextResponse.json({ matchups: {} });
  const errors: string[] = [];
  const matchups: Record<number, MatchupRow[]> = {};
  await Promise.all(ids.map(async (id) => {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < TTL) { matchups[id] = hit.rows; return; }
    try {
      const rows = await fetchCounters(id);
      cache.set(id, { at: Date.now(), rows });
      matchups[id] = rows;
    } catch (e) {
      if (hit) matchups[id] = hit.rows;
      else errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }));
  return NextResponse.json({ matchups, ...(errors.length ? { errors } : {}) }, { status: errors.length === ids.length ? 502 : 200 });
}
