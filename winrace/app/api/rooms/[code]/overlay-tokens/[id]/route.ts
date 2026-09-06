import { prisma } from "@/lib/prisma";
import { ApiError, jsonOk, withApiErrors } from "@/lib/api";
import { loadRoomContext } from "@/lib/server/route-helpers";
import { canManageOverlay } from "@/lib/server/permissions";

export async function DELETE(_req: Request, { params }: { params: { code: string; id: string } }) {
  return withApiErrors(async () => {
    const { room, member } = await loadRoomContext(params.code);
    if (!canManageOverlay(member)) throw new ApiError(403, "Nur der Host widerruft Overlay-Zugriffe.");

    const token = await prisma.overlayToken.findUnique({ where: { id: params.id } });
    if (!token || token.roomId !== room.id) throw new ApiError(404, "Token nicht gefunden.");

    await prisma.overlayToken.update({ where: { id: params.id }, data: { revokedAt: new Date() } });
    return jsonOk({ ok: true });
  });
}
