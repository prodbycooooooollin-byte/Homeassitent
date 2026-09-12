import { NextResponse } from "next/server";
import { requireAgent } from "@/lib/ingest/auth";
import { serverStatusEventSchema } from "@/lib/ingest/schemas";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Meldet Serverstart/-stopp (Agent erkennt das beim eigenen Prozessstart
 * bzw. über einen Shutdown-Hook) - Grundlage für "aktuelle Laufzeit" und die
 * Serverchronik. */
export async function POST(req: Request) {
  const auth = await requireAgent(req);
  if ("response" in auth) return auth.response;

  const json = await req.json().catch(() => null);
  const parsed = serverStatusEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Nutzdaten.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { event, at } = parsed.data;
  const occurredAt = new Date(at);

  await prisma.minecraftServer.update({
    where: { id: auth.server.id },
    data: {
      lastAgentContactAt: new Date(),
      ...(event === "start" ? { lastStartedAt: occurredAt } : {}),
    },
  });

  await prisma.serverEvent.create({
    data: {
      serverId: auth.server.id,
      occurredAt,
      type: event === "start" ? "SERVER_START" : "SERVER_STOP",
      title: event === "start" ? "Server gestartet" : "Server gestoppt",
      isAutomatic: true,
    },
  });

  return NextResponse.json({ ok: true });
}
