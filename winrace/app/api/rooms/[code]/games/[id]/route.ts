import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { requireActiveMember } from "@/lib/server/route-helpers";
import { canManageRoom } from "@/lib/server/permissions";
import { gameUpdateSchema } from "@/lib/validation";
import { updateGame, deleteGame } from "@/lib/server/challenge";
import { emitToRoom } from "@/lib/socket-server";

export async function PATCH(req: Request, { params }: { params: { code: string; id: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await requireActiveMember(params.code);
    if (!canManageRoom(member)) throw new ApiError(403, "Nur der Host bearbeitet die Spieleliste.");

    const input = await parseBody(req, gameUpdateSchema);
    const game = await updateGame(room.id, params.id, input, user.id);

    emitToRoom(room.id, "games:updated", { roomId: room.id });
    return jsonOk({ game });
  });
}

export async function DELETE(_req: Request, { params }: { params: { code: string; id: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await requireActiveMember(params.code);
    if (!canManageRoom(member)) throw new ApiError(403, "Nur der Host bearbeitet die Spieleliste.");

    await deleteGame(room.id, params.id, user.id);

    emitToRoom(room.id, "games:updated", { roomId: room.id });
    return jsonOk({ ok: true });
  });
}
