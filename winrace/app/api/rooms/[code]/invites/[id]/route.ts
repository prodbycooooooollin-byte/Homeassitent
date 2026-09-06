import { prisma } from "@/lib/prisma";
import { ApiError, jsonOk, withApiErrors } from "@/lib/api";
import { loadRoomContext } from "@/lib/server/route-helpers";
import { canManageMembers } from "@/lib/server/permissions";

export async function DELETE(_req: Request, { params }: { params: { code: string; id: string } }) {
  return withApiErrors(async () => {
    const { room, member } = await loadRoomContext(params.code);
    if (!canManageMembers(member)) throw new ApiError(403, "Nur der Host widerruft Einladungen.");

    const invite = await prisma.roomInvite.findUnique({ where: { id: params.id } });
    if (!invite || invite.roomId !== room.id) throw new ApiError(404, "Einladung nicht gefunden.");

    await prisma.roomInvite.update({ where: { id: params.id }, data: { revokedAt: new Date() } });
    return jsonOk({ ok: true });
  });
}
