import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertSameOrigin } from "@/lib/auth/api";
import { canCreateContent } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { getPrimaryServer } from "@/lib/server-context";
import { getDrawings } from "@/lib/queries/map";
import { publishMapEvent } from "@/lib/realtime/bus";
import { DIMENSIONS, DRAWING_TYPES, VISIBILITIES } from "@/lib/constants";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireApiUser();
  if (!("user" in auth)) return auth.response;

  const dimension = new URL(req.url).searchParams.get("dimension") ?? "OVERWORLD";
  const server = await getPrimaryServer();
  if (!server) return NextResponse.json({ drawings: [] });

  const drawings = await getDrawings(server.id, dimension, auth.user);
  return NextResponse.json({ drawings });
}

const pointSchema = z.object({ x: z.number(), z: z.number() });

const createSchema = z.object({
  dimension: z.enum(DIMENSIONS),
  type: z.enum(DRAWING_TYPES),
  points: z.array(pointSchema).min(1).max(2000),
  text: z.string().trim().max(200).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Farbe muss ein Hex-Code sein."),
  visibility: z.enum(VISIBILITIES),
  layerName: z.string().trim().max(60).optional(),
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
  const { points, ...rest } = parsed.data;

  const drawing = await prisma.mapDrawing.create({
    data: { serverId: server.id, ownerId: auth.user.id, points: JSON.stringify(points), ...rest },
  });

  publishMapEvent({ kind: "drawing.upsert", dimension: drawing.dimension, drawingId: drawing.id });
  return NextResponse.json({ drawing: { ...drawing, points } }, { status: 201 });
}
