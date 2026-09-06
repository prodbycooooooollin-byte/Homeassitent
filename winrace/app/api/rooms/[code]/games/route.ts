import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { requireActiveMember } from "@/lib/server/route-helpers";
import { canManageRoom } from "@/lib/server/permissions";
import { gameSchema } from "@/lib/validation";
import { addGame, listGames } from "@/lib/server/challenge";
import { emitToRoom } from "@/lib/socket-server";

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { room } = await requireActiveMember(params.code);
    const games = await listGames(room.id);
    return jsonOk({ games });
  });
}

export async function POST(req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await requireActiveMember(params.code);
    if (!canManageRoom(member)) throw new ApiError(403, "Nur der Host bearbeitet die Spieleliste.");

    const input = await parseBody(req, gameSchema);
    const game = await addGame(room.id, input, user.id);

    emitToRoom(room.id, "games:updated", { roomId: room.id });
    return jsonOk({ game }, 201);
  });
}
