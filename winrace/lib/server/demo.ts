import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { applyProgressDelta } from "@/lib/server/progress";
import { createActivityEvent } from "@/lib/server/activity";

/**
 * Alle Demo-Aktionen sind strikt auf `isDemo: true`-Räume beschränkt und
 * erfordern keinen Login – so kann jede:r Besucher:in die Oberfläche ohne
 * Konto ausprobieren, ohne jemals echte Räume oder echte Statistiken zu
 * berühren (siehe Abschnitt 18 der Spezifikation).
 */
async function requireDemoRoom(code: string) {
  const room = await prisma.room.findUnique({ where: { code: code.trim().toUpperCase() }, include: { challenge: true } });
  if (!room || !room.isDemo) throw new ApiError(404, "Kein Demo-Raum.");
  return room;
}

export async function simulateDemoProgress(code: string) {
  const room = await requireDemoRoom(code);
  if (!room.challenge || room.challenge.status !== "RUNNING") {
    throw new ApiError(409, "Demo-Challenge läuft gerade nicht.");
  }

  const candidates = await prisma.teamGameProgress.findMany({
    where: { game: { challengeId: room.challenge.id }, status: { not: "COMPLETED" } },
    include: { game: true, team: true },
  });
  if (candidates.length === 0) throw new ApiError(409, "Alle Demo-Spiele sind bereits abgeschlossen. Bitte zurücksetzen.");

  const pick = candidates[Math.floor(Math.random() * candidates.length)];

  const result = await applyProgressDelta({
    roomId: room.id,
    gameId: pick.gameId,
    teamId: pick.teamId,
    delta: 1,
    actorId: room.hostId,
    actorName: "Demo-Simulation",
    isHost: true,
  });

  return result;
}

export async function resetDemoRoom(code: string) {
  const room = await requireDemoRoom(code);
  if (!room.challenge) throw new ApiError(404, "Keine Demo-Challenge gefunden.");

  await prisma.$transaction(async (tx) => {
    await tx.teamGameProgressLog.deleteMany({ where: { progress: { game: { challengeId: room.challenge!.id } } } });
    await tx.teamGameProgress.updateMany({
      where: { game: { challengeId: room.challenge!.id } },
      data: { value: 0, status: "PENDING", startedAt: null, completedAt: null, lastUpdatedById: null, lastUpdatedAt: null },
    });
    await tx.challenge.update({
      where: { id: room.challenge!.id },
      data: { status: "RUNNING", startedAt: new Date(), pausedAt: null, totalPausedMs: 0, endedAt: null, winnerTeamId: null, winnerConfirmedAt: null, pendingWinnerTeamId: null, pendingWinnerAt: null },
    });
    await tx.team.updateMany({ where: { roomId: room.id }, data: { currentGameId: null } });
    await createActivityEvent(tx, { roomId: room.id, actorId: room.hostId, type: "CHALLENGE_STARTED", message: "Demo wurde zurückgesetzt und neu gestartet." });
  });
}
