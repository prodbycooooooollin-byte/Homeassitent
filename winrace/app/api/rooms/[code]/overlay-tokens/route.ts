import { prisma } from "@/lib/prisma";
import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { loadRoomContext } from "@/lib/server/route-helpers";
import { canManageOverlay } from "@/lib/server/permissions";
import { overlayTokenCreateSchema } from "@/lib/validation";
import { createOverlayToken } from "@/lib/server/overlay";

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { room, member } = await loadRoomContext(params.code);
    if (!canManageOverlay(member)) throw new ApiError(403, "Nur der Host verwaltet Overlay-Zugriffe.");

    const tokens = await prisma.overlayToken.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "desc" } });
    return jsonOk({
      tokens: tokens.map((t) => ({ id: t.id, label: t.label, revokedAt: t.revokedAt, lastUsedAt: t.lastUsedAt, createdAt: t.createdAt })),
    });
  });
}

export async function POST(req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await loadRoomContext(params.code);
    if (!canManageOverlay(member)) throw new ApiError(403, "Nur der Host erstellt Overlay-Zugriffe.");

    const input = await parseBody(req, overlayTokenCreateSchema);
    const created = await createOverlayToken(room.id, user.id, input.label);
    return jsonOk(created, 201);
  });
}
