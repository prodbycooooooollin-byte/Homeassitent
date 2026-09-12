import { NextResponse } from "next/server";
import { requireAgent } from "@/lib/ingest/auth";
import { sessionEventSchema } from "@/lib/ingest/schemas";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Echtzeit-Beitritt/Verlassen-Ereignisse aus dem Log-Tailing des Agents.
 * Hält "online"/"zuletzt gesehen" aktuell, ohne auf den nächsten
 * Statistik-Snapshot warten zu müssen.
 */
export async function POST(req: Request) {
  const auth = await requireAgent(req);
  if ("response" in auth) return auth.response;

  const json = await req.json().catch(() => null);
  const parsed = sessionEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Nutzdaten.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { uuid, username, type, at } = parsed.data;
  const occurredAt = new Date(at);

  const account = await prisma.minecraftAccount.upsert({
    where: { uuid },
    update: {
      username,
      isOnline: type === "join",
      lastSeenAt: occurredAt,
      firstSeenAt: undefined,
    },
    create: {
      uuid,
      username,
      isOnline: type === "join",
      firstSeenAt: occurredAt,
      lastSeenAt: occurredAt,
    },
  });

  if (type === "join") {
    await prisma.playerSession.create({
      data: { minecraftAccountId: account.id, joinedAt: occurredAt },
    });
  } else {
    const openSession = await prisma.playerSession.findFirst({
      where: { minecraftAccountId: account.id, leftAt: null },
      orderBy: { joinedAt: "desc" },
    });
    if (openSession) {
      await prisma.playerSession.update({
        where: { id: openSession.id },
        data: { leftAt: occurredAt },
      });
    }
  }

  await prisma.minecraftServer.update({
    where: { id: auth.server.id },
    data: { lastAgentContactAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
