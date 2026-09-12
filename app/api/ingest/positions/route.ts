import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAgent } from "@/lib/ingest/auth";
import { prisma } from "@/lib/db";
import { publishMapEvent } from "@/lib/realtime/bus";
import { DIMENSIONS } from "@/lib/constants";

export const runtime = "nodejs";

const schema = z.object({
  positions: z.array(
    z.object({
      uuid: z.string().min(32).max(36),
      username: z.string().min(1).max(32),
      x: z.number(),
      y: z.number(),
      z: z.number(),
      dimension: z.enum(DIMENSIONS),
    }),
  ),
});

/**
 * Leichtgewichtiger, häufig aufrufbarer Endpunkt nur für Live-Positionen
 * (getrennt vom schweren Statistik-Snapshot, um die Datensammlung minimal
 * zu halten - siehe Anforderung "möglichst wenig belasten").
 */
export async function POST(req: Request) {
  const auth = await requireAgent(req);
  if ("response" in auth) return auth.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Nutzdaten." }, { status: 400 });
  }

  const now = new Date();
  for (const p of parsed.data.positions) {
    await prisma.minecraftAccount.updateMany({
      where: { uuid: p.uuid },
      data: { posX: p.x, posY: p.y, posZ: p.z, posDimension: p.dimension, posUpdatedAt: now },
    });
  }

  if (parsed.data.positions.length > 0) {
    publishMapEvent({ kind: "players.update" });
  }
  return NextResponse.json({ ok: true, updated: parsed.data.positions.length });
}
