import { NextResponse } from "next/server";
import { fetchHeroMeta } from "@/lib/api";

export const dynamic = "force-dynamic";

let cache: { at: number; data: Awaited<ReturnType<typeof fetchHeroMeta>> } | null = null;

export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > 30 * 60_000) cache = { at: Date.now(), data: await fetchHeroMeta() };
    return NextResponse.json({ heroes: cache.data, at: cache.at });
  } catch (e) {
    if (cache) return NextResponse.json({ heroes: cache.data, at: cache.at, stale: true });
    return NextResponse.json({ heroes: [], error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
