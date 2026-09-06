import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { requireActiveMember, clientIp } from "@/lib/server/route-helpers";
import { canUpdateTeamProgress, isHost } from "@/lib/server/permissions";
import { progressUpdateSchema } from "@/lib/validation";
import { applyProgressDelta } from "@/lib/server/progress";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { broadcastActivity, broadcastNotification } from "@/lib/server/activity";
import { emitToRoom } from "@/lib/socket-server";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await requireActiveMember(params.code);
    const { teamId, gameId, delta } = await parseBody(req, progressUpdateSchema);

    const settings = { allowMemberProgress: room.allowMemberProgress, onlyTeamLeadEdits: room.onlyTeamLeadEdits, teamsLocked: room.teamsLocked };
    if (!canUpdateTeamProgress(member, teamId, settings)) {
      throw new ApiError(403, "Du darfst den Fortschritt dieses Teams nicht ändern.");
    }

    const rl = consumeRateLimit(`progress:${user.id}:${room.id}`, RATE_LIMITS.progressUpdate.limit, RATE_LIMITS.progressUpdate.windowMs);
    if (!rl.ok) throw new ApiError(429, "Zu viele Änderungen in kurzer Zeit. Bitte kurz warten.");

    const result = await applyProgressDelta({
      roomId: room.id,
      gameId,
      teamId,
      delta,
      actorId: user.id,
      actorName: user.displayName,
      isHost: isHost(member),
    });

    broadcastActivity(room.id, result.activityEvent);
    if (result.gameCompletedEvent) broadcastActivity(room.id, result.gameCompletedEvent);
    if (result.winnerNotification) broadcastNotification(room.id, result.winnerNotification);
    emitToRoom(room.id, "progress:updated", { roomId: room.id, gameId, teamId });
    if (result.pendingWinnerTeamId || result.challengeFinished) {
      emitToRoom(room.id, result.challengeFinished ? "winner:confirmed" : "winner:pending", { roomId: room.id, teamId: result.pendingWinnerTeamId });
      emitToRoom(room.id, "challenge:updated", { roomId: room.id });
    }

    return jsonOk({ progress: result.progress, logId: result.logId });
  });
}
