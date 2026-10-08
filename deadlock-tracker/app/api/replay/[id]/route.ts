import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { isDemo } from "@/lib/api";
import { getAssets } from "@/lib/assets";
import { alignAccount } from "@/lib/align";
import { analyzeReplay } from "@/lib/replay-analysis";
import { analyzeBasic } from "@/lib/replay-basic";
import { demoReplay } from "@/lib/replay-demo";
import { hasReplay, jobStatus, loadReplay, mergeDetails, startReplay } from "@/lib/replay-server";

export const dynamic = "force-dynamic";

/** Replay-Auswertung eines Matches: Status, bei Erfolg Positionsdaten und Szenen-Analyse für den angegebenen Account. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const matchId = Number(params.id);
  const account = Number(new URL(req.url).searchParams.get("account")) || 0;
  const rec = getStore().matches[matchId];
  const details = rec?.details ?? null;
  if (details && account) alignAccount(details, account, rec?.history[String(account)]);
  const replay = isDemo() ? (details ? demoReplay(details) : null) : hasReplay(matchId) ? loadReplay(matchId) : null;
  if (!replay) {
    const j = jobStatus(matchId);
    // Ohne Replay trotzdem eine Auswertung aus den Match-Daten liefern (ohne Karte)
    const assets0 = details ? await getAssets().catch(() => null) : null;
    const basic = details ? analyzeBasic(details, account, (id) => assets0?.heroes[id]?.name ?? `Held ${id}`) : null;
    return NextResponse.json({ status: j ? j.state : "none", job: j, basic });
  }
  const merged = mergeDetails(replay, details);
  const assets = await getAssets().catch(() => null);
  const analysis = analyzeReplay(merged, details, account, { heroName: (id) => assets?.heroes[id]?.name ?? `Held ${id}` });
  return NextResponse.json({ status: "done", replay: merged, analysis });
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const matchId = Number(params.id);
  if (!matchId) return NextResponse.json({ error: "Match-ID fehlt" }, { status: 400 });
  return NextResponse.json({ status: "running", job: await startReplay(matchId) });
}
