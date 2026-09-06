import { prisma } from "@/lib/prisma";
import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { requireActiveMember } from "@/lib/server/route-helpers";
import { canAddEvidence } from "@/lib/server/permissions";
import { evidenceSchema } from "@/lib/validation";
import { createActivityEvent } from "@/lib/server/activity";
import { emitToRoom } from "@/lib/socket-server";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await requireActiveMember(params.code);
    const input = await parseBody(req, evidenceSchema);

    const progress = await prisma.teamGameProgress.findUnique({
      where: { id: input.progressId },
      include: { game: { include: { challenge: true } }, team: true },
    });
    if (!progress || progress.game.challenge.roomId !== room.id) throw new ApiError(404, "Fortschritt nicht gefunden.");
    if (!canAddEvidence(member, progress.teamId)) throw new ApiError(403, "Du darfst hier keinen Beweis hinzufügen.");

    const evidence = await prisma.$transaction(async (tx) => {
      const created = await tx.evidence.create({
        data: { progressId: progress.id, authorId: user.id, memberId: member.id, url: input.url, comment: input.comment },
      });
      await createActivityEvent(tx, {
        roomId: room.id,
        actorId: user.id,
        type: "EVIDENCE_ADDED",
        message: `${user.displayName} hat einen Beweis zu „${progress.game.name}“ (${progress.team.name}) hinzugefügt.`,
      });
      return created;
    });

    emitToRoom(room.id, "progress:updated", { roomId: room.id });
    return jsonOk({ evidence }, 201);
  });
}
