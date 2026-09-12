import { NextResponse } from "next/server";
import { requireAgent } from "@/lib/ingest/auth";
import { linkAttemptSchema } from "@/lib/ingest/schemas";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Wird vom Agent aufgerufen, sobald er im Server-Chat "!link CODE" von
 * einem Spieler gesehen hat (siehe connector/README.md). Bestätigt den Code
 * und verknüpft den Website-Account mit der Minecraft-UUID.
 */
export async function POST(req: Request) {
  const auth = await requireAgent(req);
  if ("response" in auth) return auth.response;

  const json = await req.json().catch(() => null);
  const parsed = linkAttemptSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Ungültige Anfrage." }, { status: 400 });
  }
  const { code, uuid, username } = parsed.data;

  const linkCode = await prisma.linkCode.findUnique({ where: { code } });
  if (!linkCode || linkCode.usedAt || linkCode.expiresAt < new Date()) {
    return NextResponse.json({ ok: false, message: "Code ungültig oder abgelaufen." });
  }

  const existingForUuid = await prisma.minecraftAccount.findUnique({ where: { uuid } });
  if (existingForUuid?.userId && existingForUuid.userId !== linkCode.userId) {
    return NextResponse.json({
      ok: false,
      message: "Dieser Minecraft-Account ist bereits mit einem anderen Konto verknüpft.",
    });
  }

  await prisma.$transaction([
    prisma.minecraftAccount.upsert({
      where: { uuid },
      update: { userId: linkCode.userId, username },
      create: { uuid, username, userId: linkCode.userId, firstSeenAt: new Date(), lastSeenAt: new Date() },
    }),
    prisma.linkCode.update({ where: { id: linkCode.id }, data: { usedAt: new Date() } }),
  ]);

  const user = await prisma.user.findUnique({ where: { id: linkCode.userId } });

  return NextResponse.json({
    ok: true,
    message: `Verknüpft mit Craftboard-Konto „${user?.displayName ?? "?"}“.`,
  });
}
