import { NextResponse } from "next/server";
import { requireAgent } from "@/lib/ingest/auth";
import { deathEventSchema } from "@/lib/ingest/schemas";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Persönlicher Todesmarker - Standardsichtbarkeit PRIVATE (nur der Spieler selbst). */
export async function POST(req: Request) {
  const auth = await requireAgent(req);
  if ("response" in auth) return auth.response;

  const json = await req.json().catch(() => null);
  const parsed = deathEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Nutzdaten.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { uuid, username, at, message, x, y, z, dimension } = parsed.data;
  const occurredAt = new Date(at);

  const account = await prisma.minecraftAccount.upsert({
    where: { uuid },
    update: { username },
    create: { uuid, username, firstSeenAt: occurredAt, lastSeenAt: occurredAt },
  });

  const death = await prisma.deathEvent.create({
    data: { minecraftAccountId: account.id, occurredAt, message, x, y, z, dimension },
  });

  void auth.server;
  return NextResponse.json({ ok: true, id: death.id });
}
