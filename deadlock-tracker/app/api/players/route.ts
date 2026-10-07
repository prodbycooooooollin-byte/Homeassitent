import { NextResponse } from "next/server";
import { addPlayer, removePlayer, syncPlayer } from "@/lib/sync";
import { getStore } from "@/lib/store";
import { parseAccountId } from "@/lib/steamid";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(Object.values(getStore().players));
}

export async function POST(req: Request) {
  const { input } = (await req.json().catch(() => ({}))) as { input?: string };
  const id = parseAccountId(String(input ?? ""));
  if (!id) {
    return NextResponse.json(
      { error: "Ungültige ID. Erlaubt: Steam32-Account-ID, Steam64-ID oder steamcommunity.com/profiles/…-Link (Vanity-URLs werden nicht aufgelöst)." },
      { status: 400 },
    );
  }
  const player = await addPlayer(id);
  const sync = await syncPlayer(id);
  return NextResponse.json({ player: getStore().players[String(id)] ?? player, sync });
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("account"));
  if (!id) return NextResponse.json({ error: "account fehlt" }, { status: 400 });
  removePlayer(id);
  return NextResponse.json({ ok: true });
}
