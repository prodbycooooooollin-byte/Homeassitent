import fs from "fs";
import { NextResponse } from "next/server";
import { getAssets } from "@/lib/assets";
import { glbPath, hasModel, modelJob, modelReport, startModel } from "@/lib/hero3d-server";

export const dynamic = "force-dynamic";

/** GET: das exportierte 3D-Modell (GLB) bzw. mit ?probe=1 nur der Status. POST: Export aus der lokalen Spiel-Installation starten. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (new URL(req.url).searchParams.has("report")) return NextResponse.json(modelReport(id) ?? { error: "Kein Bericht" });
  if (new URL(req.url).searchParams.has("probe")) return NextResponse.json({ ready: hasModel(id), job: modelJob(id) });
  if (!hasModel(id)) return NextResponse.json({ error: "Kein Modell" }, { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(glbPath(id))), { headers: { "content-type": "model/gltf-binary", "cache-control": "public, max-age=86400" } });
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  if (hasModel(id)) return NextResponse.json({ ready: true });
  const assets = await getAssets().catch(() => null);
  const job = await startModel(id, assets?.heroes[id]?.codeName);
  return NextResponse.json({ ready: false, job });
}
