import { requireUser, clientIp } from "@/lib/server/route-helpers";
import { joinRoomSchema } from "@/lib/validation";
import { jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { joinRoom } from "@/lib/server/rooms";
import { broadcastActivity } from "@/lib/server/activity";
import { emitToRoom } from "@/lib/socket-server";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const user = await requireUser();
    const input = await parseBody(req, joinRoomSchema);
    const { room, member } = await joinRoom({ ...input, code: params.code, userId: user.id, ip: clientIp(req) });

    emitToRoom(room.id, "members:updated", { roomId: room.id });
    broadcastActivity(room.id, { message: member.status === "PENDING" ? "Neue Beitrittsanfrage." : "Neues Mitglied beigetreten." });

    return jsonOk({ code: room.code, status: member.status });
  });
}
