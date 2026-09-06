import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { requireActiveMember } from "@/lib/server/route-helpers";
import { canUpdateTeamProgress } from "@/lib/server/permissions";
import { createActivityEvent } from "@/lib/server/activity";
import { emitToRoom } from "@/lib/socket-server";

const schema = z.object({ gameId: z.string().min(10).nullable() });

export async function POST(req: Request, { params }: { params: { code: string; teamId: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await requireActiveMember(params.code);
    const settings = { allowMemberProgress: room.allowMemberProgress, onlyTeamLeadEdits: room.onlyTeamLeadEdits, teamsLocked: room.teamsLocked };
    if (!canUpdateTeamProgress(member, params.teamId, settings)) {
      throw new ApiError(403, "Du darfst das aktuelle Spiel dieses Teams nicht ändern.");
    }

    const { gameId } = await parseBody(req, schema);
    const team = await prisma.team.findUnique({ where: { id: params.teamId } });
    if (!team || team.roomId !== room.id) throw new ApiError(404, "Team nicht gefunden.");

    let gameName: string | null = null;
    if (gameId) {
      const game = await prisma.challengeGame.findUnique({ where: { id: gameId }, include: { challenge: true } });
      if (!game || game.challenge.roomId !== room.id) throw new ApiError(404, "Spiel nicht gefunden.");
      gameName = game.name;
    }

    await prisma.$transaction(async (tx) => {
      await tx.team.update({ where: { id: team.id }, data: { currentGameId: gameId } });
      await createActivityEvent(tx, {
        roomId: room.id,
        actorId: user.id,
        type: "CURRENT_GAME_SELECTED",
        message: gameId ? `${team.name} spielt jetzt „${gameName}“.` : `${team.name} hat kein aktuelles Spiel mehr ausgewählt.`,
      });
    });

    emitToRoom(room.id, "teams:updated", { roomId: room.id });
    return jsonOk({ ok: true });
  });
}
