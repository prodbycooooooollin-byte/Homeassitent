import { ApiError, jsonOk, withApiErrors } from "@/lib/api";
import { requireActiveMember } from "@/lib/server/route-helpers";
import { canManageRoom } from "@/lib/server/permissions";
import { undoProgressLog } from "@/lib/server/progress";
import { broadcastActivity } from "@/lib/server/activity";
import { emitToRoom } from "@/lib/socket-server";

export async function POST(_req: Request, { params }: { params: { code: string; logId: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await requireActiveMember(params.code);
    if (!canManageRoom(member)) throw new ApiError(403, "Nur der Host kann Fortschrittsänderungen rückgängig machen.");

    const result = await undoProgressLog({ roomId: room.id, logId: params.logId, actorId: user.id, actorName: user.displayName });

    broadcastActivity(room.id, result.activityEvent);
    emitToRoom(room.id, "progress:updated", { roomId: room.id });
    emitToRoom(room.id, "challenge:updated", { roomId: room.id });

    return jsonOk({ progress: result.progress });
  });
}
