import { NextResponse } from "next/server";
import { fetchMates, fetchProfiles } from "@/lib/api";
import { getStore } from "@/lib/store";
import { mates as localMates } from "@/lib/view";

export const dynamic = "force-dynamic";

type Kind = "mates" | "enemies" | "party";
const cache = new Map<string, { at: number; rows: Row[] }>();
interface Row { accountId: number; name?: string; avatar?: string; games: number; wins: number; matchIds: number[]; tracked: boolean }

export async function GET(req: Request) {
  const u = new URL(req.url);
  const account = Number(u.searchParams.get("account"));
  const kind = (["mates", "enemies", "party"].includes(u.searchParams.get("kind") ?? "") ? u.searchParams.get("kind") : "mates") as Kind;
  if (!account) return NextResponse.json({ error: "account fehlt" }, { status: 400 });
  const store = getStore();
  const all = Object.values(store.matches).filter((m) => m.history[String(account)]);
  const coverage = { total: all.length, withDetails: all.filter((m) => m.details).length };
  const key = `${account}:${kind}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return NextResponse.json({ rows: hit.rows, source: "api", coverage });
  try {
    const base = await fetchMates(account, kind);
    // Namen/Avatare in Blöcken nachladen (URL-Länge)
    const prof = new Map<number, { name: string; avatar?: string }>();
    for (let i = 0; i < base.length; i += 40) {
      for (const p of await fetchProfiles(base.slice(i, i + 40).map((r) => r.accountId))) prof.set(p.accountId, { name: p.name, avatar: p.avatar });
    }
    const rows: Row[] = base.map((r) => ({ ...r, name: prof.get(r.accountId)?.name, avatar: prof.get(r.accountId)?.avatar, tracked: !!store.players[String(r.accountId)] }));
    cache.set(key, { at: Date.now(), rows });
    return NextResponse.json({ rows, source: "api", coverage });
  } catch (e) {
    // Fallback: aus den lokal vorliegenden Match-Details (unvollständig, solange nicht alle Matches nachgeladen sind)
    if (kind === "party") return NextResponse.json({ rows: [], source: "none", error: e instanceof Error ? e.message : String(e), coverage });
    const rows: Row[] = localMates(account, 2).map((m) => ({ accountId: m.accountId, name: m.name, avatar: m.avatar, games: m.games, wins: m.wins, matchIds: [], tracked: !!store.players[String(m.accountId)] }));
    return NextResponse.json({ rows, source: "local", error: e instanceof Error ? e.message : String(e), coverage });
  }
}
