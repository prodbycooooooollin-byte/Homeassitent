import { prisma } from "@/lib/prisma";
import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { getRoomPreview } from "@/lib/server/rooms";
import { loadRoomContext } from "@/lib/server/route-helpers";
import { updateRoomSettingsSchema } from "@/lib/validation";
import { canManageRoom } from "@/lib/server/permissions";
import { createActivityEvent, broadcastActivity } from "@/lib/server/activity";
import { emitToRoom } from "@/lib/socket-server";
import { hashSecret } from "@/lib/codes";

export async function GET(req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const preview = await getRoomPreview(params.code);
    if (!preview) throw new ApiError(404, "Raum nicht gefunden.");
    return jsonOk(preview);
  });
}

export async function PATCH(req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await loadRoomContext(params.code);
    if (!canManageRoom(member)) throw new ApiError(403, "Nur der Host kann Einstellungen ändern.");

    const input = await parseBody(req, updateRoomSettingsSchema);
    const { newPassword, teamAName, teamBName, teamAColor, teamBColor, ...roomFields } = input;

    const updated = await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = { ...roomFields };
      if (newPassword) data.passwordHash = await hashSecret(newPassword);

      const updatedRoom = await tx.room.update({ where: { id: room.id }, data });

      if (teamAName || teamAColor) {
        await tx.team.update({ where: { roomId_side: { roomId: room.id, side: "A" } }, data: { name: teamAName, color: teamAColor } });
      }
      if (teamBName || teamBColor) {
        await tx.team.update({ where: { roomId_side: { roomId: room.id, side: "B" } }, data: { name: teamBName, color: teamBColor } });
      }

      const activityEvent = await createActivityEvent(tx, {
        roomId: room.id,
        actorId: user.id,
        type: "ROOM_SETTINGS_UPDATED",
        message: "Der Host hat die Raumeinstellungen aktualisiert.",
      });

      return { updatedRoom, activityEvent };
    });

    broadcastActivity(room.id, updated.activityEvent);
    emitToRoom(room.id, "room:updated", { roomId: room.id });

    return jsonOk({ ok: true });
  });
}
