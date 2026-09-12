import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertSameOrigin } from "@/lib/auth/api";
import { canCreateContent } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { getPrimaryServer } from "@/lib/server-context";
import { getMarkers } from "@/lib/queries/map";
import { publishMapEvent } from "@/lib/realtime/bus";
import { DIMENSIONS, MARKER_CATEGORIES, VISIBILITIES } from "@/lib/constants";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireApiUser();
  if (!("user" in auth)) return auth.response;

  const dimension = new URL(req.url).searchParams.get("dimension") ?? "OVERWORLD";
  const server = await getPrimaryServer();
  if (!server) return NextResponse.json({ markers: [] });

  const markers = await getMarkers(server.id, dimension, auth.user);
  return NextResponse.json({ markers });
}

const createSchema = z.object({
  dimension: z.enum(DIMENSIONS),
  x: z.number(),
  y: z.number().nullable().optional(),
  z: z.number(),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).optional(),
  category: z.enum(MARKER_CATEGORIES),
  visibility: z.enum(VISIBILITIES),
});

export async function POST(req: Request) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireApiUser();
  if (!("user" in auth)) return auth.response;
  if (!canCreateContent(auth.user.role)) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const server = await getPrimaryServer();
  if (!server) return NextResponse.json({ error: "Kein Server eingerichtet." }, { status: 400 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const marker = await prisma.mapMarker.create({
    data: { serverId: server.id, ownerId: auth.user.id, ...parsed.data },
  });

  publishMapEvent({ kind: "marker.upsert", dimension: marker.dimension, markerId: marker.id });
  return NextResponse.json({ marker }, { status: 201 });
}
