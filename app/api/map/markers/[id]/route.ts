import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertSameOrigin } from "@/lib/auth/api";
import { canEditEntity } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { publishMapEvent } from "@/lib/realtime/bus";
import { MARKER_CATEGORIES, VISIBILITIES } from "@/lib/constants";

export const runtime = "nodejs";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(1000).optional(),
  category: z.enum(MARKER_CATEGORIES).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireApiUser();
  if (!("user" in auth)) return auth.response;

  const { id } = await params;
  const marker = await prisma.mapMarker.findUnique({ where: { id } });
  if (!marker) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  if (!canEditEntity(auth.user.role, auth.user.id, marker.ownerId)) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const updated = await prisma.mapMarker.update({ where: { id }, data: parsed.data });
  publishMapEvent({ kind: "marker.upsert", dimension: updated.dimension, markerId: updated.id });
  return NextResponse.json({ marker: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireApiUser();
  if (!("user" in auth)) return auth.response;

  const { id } = await params;
  const marker = await prisma.mapMarker.findUnique({ where: { id } });
  if (!marker) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  if (!canEditEntity(auth.user.role, auth.user.id, marker.ownerId)) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  await prisma.mapMarker.delete({ where: { id } });
  publishMapEvent({ kind: "marker.delete", dimension: marker.dimension, markerId: id });
  return NextResponse.json({ ok: true });
}
