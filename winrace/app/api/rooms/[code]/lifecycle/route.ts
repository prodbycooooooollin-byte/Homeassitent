import { z } from "zod";
import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { loadRoomContext } from "@/lib/server/route-helpers";
import { canManageRoom } from "@/lib/server/permissions";
import { startChallenge, markReady, pauseChallenge, resumeChallenge, endChallenge, confirmWinner, archiveChallenge } from "@/lib/server/challenge";
import { broadcastActivity, broadcastNotification } from "@/lib/server/activity";
import { emitToRoom } from "@/lib/socket-server";

const schema = z.object({
  action: z.enum(["ready", "start", "pause", "resume", "end", "confirm_winner", "archive"]),
  winnerTeamId: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await loadRoomContext(params.code);
    if (!canManageRoom(member)) throw new ApiError(403, "Nur der Host steuert den Ablauf der Challenge.");

    const { action, winnerTeamId } = await parseBody(req, schema);

    let result: { activityEvent?: unknown; notification?: unknown } = {};
    switch (action) {
      case "ready":
        result = await markReady(room.id, user.id);
        break;
      case "start":
        result = await startChallenge(room.id, user.id);
        break;
      case "pause":
        result = await pauseChallenge(room.id, user.id);
        break;
      case "resume":
        result = await resumeChallenge(room.id, user.id);
        break;
      case "end":
        result = await endChallenge(room.id, user.id, winnerTeamId ?? null);
        break;
      case "confirm_winner":
        result = await confirmWinner(room.id, user.id);
        break;
      case "archive":
        result = await archiveChallenge(room.id, user.id);
        break;
    }

    if (result.activityEvent) broadcastActivity(room.id, result.activityEvent);
    if (result.notification) broadcastNotification(room.id, result.notification);
    emitToRoom(room.id, "challenge:updated", { roomId: room.id });

    return jsonOk({ ok: true });
  });
}
