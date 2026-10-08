import { NextResponse } from "next/server";
import { addPlayer, syncPlayer } from "@/lib/sync";
import { getStore, saveStore } from "@/lib/store";
import { verifySteamAssertion } from "@/lib/steam-openid";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await verifySteamAssertion(url.searchParams, url.origin);
  if (!r.ok || !r.accountId || !r.steamId) {
    return NextResponse.redirect(`${url.origin}/settings?steam=error&reason=${encodeURIComponent(r.error ?? "Fehler")}`);
  }
  getStore().steam = { steamId: r.steamId, accountId: r.accountId, verifiedAt: Date.now() };
  saveStore();
  await addPlayer(r.accountId);
  syncPlayer(r.accountId).catch(() => {});
  return NextResponse.redirect(`${url.origin}/?steam=ok&account=${r.accountId}`);
}
