import { NextResponse } from "next/server";
import { fetchBuilds, fetchCounters, fetchSynergies, fetchTopItems } from "@/lib/api";
import { getAssets, getItems, type ItemAsset } from "@/lib/assets";

export const dynamic = "force-dynamic";

const cache = new Map<number, { at: number; data: unknown }>();
const wr = (m: { wins: number; matches: number }) => (m.matches ? m.wins / m.matches : 0);

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 30 * 60_000) return NextResponse.json(hit.data);

  const [assets, items, builds, top, counters, syn] = await Promise.allSettled([getAssets(), getItems(), fetchBuilds(id), fetchTopItems(id), fetchCounters(id), fetchSynergies(id)]);
  const errors: Record<string, string> = {};
  const val = <T,>(r: PromiseSettledResult<T>, name: string, fallback: T): T => { if (r.status === "fulfilled") return r.value; errors[name] = String(r.reason?.message ?? r.reason); return fallback; };
  const hero = val(assets, "assets", null as Awaited<ReturnType<typeof getAssets>> | null)?.heroes[id] ?? null;
  const itemMap = val(items, "items", {} as Record<number, ItemAsset>);
  const byClass = new Map(Object.values(itemMap).filter((i) => i.cls).map((i) => [i.cls as string, i]));
  const item = (n: number) => itemMap[n] ?? { id: n, name: `Item #${n}`, tier: 1, slot: "weapon" } as ItemAsset;

  const cs = val(counters, "counters", []).filter((c) => c.matches >= 40).map((c) => ({ ...c, wr: wr(c) })).sort((a, b) => b.wr - a.wr);
  const ss = val(syn, "synergy", []).filter((c) => c.matches >= 40).map((c) => ({ ...c, wr: wr(c) })).sort((a, b) => b.wr - a.wr);
  const data = {
    hero,
    abilities: (hero?.info?.abilityClasses ?? []).map((c) => byClass.get(c)).filter(Boolean).slice(0, 6),
    builds: val(builds, "builds", []).map((b) => ({ ...b, categories: b.categories.map((c) => ({ name: c.name, items: c.itemIds.map(item) })) })),
    topItems: val(top, "topItems", []).map((t) => ({ item: item(t.itemId), builds: t.builds })),
    strong: cs.slice(0, 5), weak: cs.slice(-5).reverse(),
    synergy: ss.slice(0, 5),
    errors,
  };
  if (!Object.keys(errors).length) cache.set(id, { at: Date.now(), data });
  return NextResponse.json(data);
}
