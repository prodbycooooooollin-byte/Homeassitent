import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { loadRoomContext } from "@/lib/server/route-helpers";
import { canManageMembers } from "@/lib/server/permissions";
import { memberActionSchema } from "@/lib/validation";
import { promoteToLead, demoteToMember, removeMember, approveJoinRequest, hostAssignMember } from "@/lib/server/members";
import { broadcastNotification } from "@/lib/server/activity";
import { emitToRoom } from "@/lib/socket-server";

export async function PATCH(req: Request, { params }: { params: { code: string; id: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await loadRoomContext(params.code);
    if (!canManageMembers(member)) throw new ApiError(403, "Nur der Host verwaltet Mitglieder.");

    const input = await parseBody(req, memberActionSchema);
    let notification;

    switch (input.action) {
      case "PROMOTE_LEAD":
        await promoteToLead(room.id, params.id, user.id);
        break;
      case "DEMOTE_LEAD":
        await demoteToMember(room.id, params.id, user.id);
        break;
      case "REMOVE":
        await removeMember(room.id, params.id, user.id);
        break;
      case "APPROVE": {
        const result = await approveJoinRequest(room.id, params.id, user.id);
        notification = result.notification;
        break;
      }
      case "ASSIGN_TEAM":
        await hostAssignMember(room.id, params.id, input.side ?? null, user.id);
        break;
    }

    emitToRoom(room.id, "members:updated", { roomId: room.id });
    if (notification) broadcastNotification(room.id, notification);

    return jsonOk({ ok: true });
  });
}
