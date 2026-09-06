import { prisma } from "@/lib/prisma";
import { ApiError, jsonOk, withApiErrors } from "@/lib/api";
import { computeRoomStats } from "@/lib/server/stats";
import { getCurrentUser } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const room = await prisma.room.findUnique({ where: { code: params.code.trim().toUpperCase() } });
    if (!room) throw new ApiError(404, "Raum nicht gefunden.");

    if (room.visibility !== "PUBLIC" && !room.isDemo) {
      const user = await getCurrentUser();
      if (!user) throw new ApiError(401, "Bitte melde dich an.");
      const member = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId: room.id, userId: user.id } } });
      if (!member || member.status !== "ACTIVE") throw new ApiError(403, "Dieser Raum ist privat.");
    }

    const stats = await computeRoomStats(room.id);
    return jsonOk({ stats });
  });
}
