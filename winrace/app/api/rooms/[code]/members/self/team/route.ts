import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { loadRoomContext } from "@/lib/server/route-helpers";
import { assignTeamSchema } from "@/lib/validation";
import { selfAssignTeam } from "@/lib/server/members";
import { emitToRoom } from "@/lib/socket-server";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { room, member } = await loadRoomContext(params.code);
    if (!member || member.status !== "ACTIVE") throw new ApiError(403, "Du bist kein aktives Mitglied dieses Raums.");

    const input = await parseBody(req, assignTeamSchema);
    await selfAssignTeam(room.id, member.id, input.side);

    emitToRoom(room.id, "members:updated", { roomId: room.id });
    return jsonOk({ ok: true });
  });
}
