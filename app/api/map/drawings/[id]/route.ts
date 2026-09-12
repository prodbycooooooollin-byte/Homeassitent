import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertSameOrigin } from "@/lib/auth/api";
import { canEditEntity } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { publishMapEvent } from "@/lib/realtime/bus";
import { VISIBILITIES } from "@/lib/constants";

export const runtime = "nodejs";

const updateSchema = z.object({
  text: z.string().trim().max(200).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireApiUser();
  if (!("user" in auth)) return auth.response;

  const { id } = await params;
  const drawing = await prisma.mapDrawing.findUnique({ where: { id } });
  if (!drawing) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  if (!canEditEntity(auth.user.role, auth.user.id, drawing.ownerId)) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const updated = await prisma.mapDrawing.update({ where: { id }, data: parsed.data });
  publishMapEvent({ kind: "drawing.upsert", dimension: updated.dimension, drawingId: updated.id });
  return NextResponse.json({ drawing: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireApiUser();
  if (!("user" in auth)) return auth.response;

  const { id } = await params;
  const drawing = await prisma.mapDrawing.findUnique({ where: { id } });
  if (!drawing) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  if (!canEditEntity(auth.user.role, auth.user.id, drawing.ownerId)) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  await prisma.mapDrawing.delete({ where: { id } });
  publishMapEvent({ kind: "drawing.delete", dimension: drawing.dimension, drawingId: id });
  return NextResponse.json({ ok: true });
}
