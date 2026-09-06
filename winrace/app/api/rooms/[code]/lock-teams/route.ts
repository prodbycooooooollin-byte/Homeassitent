import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { loadRoomContext } from "@/lib/server/route-helpers";
import { canManageRoom } from "@/lib/server/permissions";
import { setTeamsLocked } from "@/lib/server/members";
import { broadcastActivity } from "@/lib/server/activity";
import { emitToRoom } from "@/lib/socket-server";
import { z } from "zod";

const schema = z.object({ locked: z.boolean() });

export async function POST(req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await loadRoomContext(params.code);
    if (!canManageRoom(member)) throw new ApiError(403, "Nur der Host kann Teams sperren.");

    const { locked } = await parseBody(req, schema);
    const activityEvent = await setTeamsLocked(room.id, locked, user.id);

    broadcastActivity(room.id, activityEvent);
    emitToRoom(room.id, "room:updated", { roomId: room.id });
    return jsonOk({ ok: true });
  });
}
