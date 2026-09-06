import { ApiError, jsonOk, withApiErrors } from "@/lib/api";
import { requireActiveMember } from "@/lib/server/route-helpers";
import { canManageRoom } from "@/lib/server/permissions";
import { duplicateGame } from "@/lib/server/challenge";
import { emitToRoom } from "@/lib/socket-server";

export async function POST(_req: Request, { params }: { params: { code: string; id: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await requireActiveMember(params.code);
    if (!canManageRoom(member)) throw new ApiError(403, "Nur der Host bearbeitet die Spieleliste.");

    const game = await duplicateGame(room.id, params.id, user.id);
    emitToRoom(room.id, "games:updated", { roomId: room.id });
    return jsonOk({ game }, 201);
  });
}
