import { NextResponse } from "next/server";
import { getAssets } from "@/lib/assets";
import { batchStatus, findDeadlockPak, modelCount, modelReports, startAll } from "@/lib/hero3d-server";

export const dynamic = "force-dynamic";

/** GET: Stand der Vorbereitung aller 3D-Modelle. POST: alle Helden vorbereiten ({ force: true } = neu exportieren). */
export async function GET() {
  const reports = modelReports();
  // Kurzfassung je Modell + der Bericht mit den meisten Materialien ohne Farbtextur (zum Weitergeben bei Fehlersuche)
  const summary = reports.map((r) => ({ heroId: r.heroId, materials: r.materials.length, tied: r.materials.filter((m) => m.tied).length, images: r.images, sizeMB: r.sizeMB }));
  const worst = [...reports].sort((a, b) => b.materials.filter((m) => !m.tied).length - a.materials.filter((m) => !m.tied).length)[0] ?? null;
  return NextResponse.json({ ...batchStatus(), models: modelCount(), gameFound: !!(await findDeadlockPak()), summary, worst });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const assets = await getAssets().catch(() => null);
  const heroes = Object.values(assets?.heroes ?? {}).filter((h) => h.playable !== false).map((h) => ({ id: h.id, name: h.name, code: h.codeName }));
  if (!heroes.length) return NextResponse.json({ error: "Heldenliste nicht verfügbar" }, { status: 503 });
  return NextResponse.json({ ...startAll(heroes, !!body.force), models: modelCount() });
}
