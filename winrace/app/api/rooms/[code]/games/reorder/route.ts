import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { requireActiveMember } from "@/lib/server/route-helpers";
import { canManageRoom } from "@/lib/server/permissions";
import { reorderGamesSchema } from "@/lib/validation";
import { reorderGames } from "@/lib/server/challenge";
import { emitToRoom } from "@/lib/socket-server";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await requireActiveMember(params.code);
    if (!canManageRoom(member)) throw new ApiError(403, "Nur der Host sortiert die Spieleliste.");

    const { orderedIds } = await parseBody(req, reorderGamesSchema);
    await reorderGames(room.id, orderedIds, user.id);

    emitToRoom(room.id, "games:updated", { roomId: room.id });
    return jsonOk({ ok: true });
  });
}
