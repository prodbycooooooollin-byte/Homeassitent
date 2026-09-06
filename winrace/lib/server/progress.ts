import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { createActivityEvent, createNotification } from "@/lib/server/activity";

/**
 * Atomarer Fortschritts-Update-Kern.
 *
 * Sicherheit gegen Race-Conditions: Wir sperren die betroffene
 * TeamGameProgress-Zeile per `SELECT ... FOR UPDATE` innerhalb einer
 * Transaktion, bevor wir den neuen Wert berechnen und schreiben. Zwei
 * gleichzeitige Klicks auf "+1" führen dadurch garantiert zu zwei
 * aufeinanderfolgenden, korrekten Inkrementen statt zu einem verlorenen
 * Update ("Lost Update"-Problem klassischer Read-Modify-Write-Bugs).
 *
 * Wird durch diese Änderung das letzte offene Spiel eines Teams
 * abgeschlossen, wird zusätzlich die Challenge-Zeile gesperrt, um bei
 * nahezu gleichzeitigen Schluss-Siegen beider Teams eindeutig (nach
 * Datenbank-Commit-Reihenfolge = Serverzeit) einen einzigen Gewinner zu
 * bestimmen.
 */

export interface ProgressChangeResult {
  progress: Awaited<ReturnType<typeof prisma.teamGameProgress.findUniqueOrThrow>>;
  logId: string;
  activityEvent: Awaited<ReturnType<typeof createActivityEvent>>;
  gameCompletedEvent: Awaited<ReturnType<typeof createActivityEvent>> | null;
  winnerNotification: Awaited<ReturnType<typeof createNotification>> | null;
  challengeFinished: boolean;
  pendingWinnerTeamId: string | null;
}

interface ApplyDeltaParams {
  roomId: string;
  gameId: string;
  teamId: string;
  delta: number;
  actorId: string;
  actorName: string;
  isHost: boolean;
}

export async function applyProgressDelta(params: ApplyDeltaParams): Promise<ProgressChangeResult> {
  const { roomId, gameId, teamId, delta, actorId, actorName, isHost } = params;

  return prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId }, include: { challenge: true, teams: true } });
    if (!room || !room.challenge) throw new ApiError(404, "Raum oder Challenge nicht gefunden.");
    const challenge = room.challenge;

    if (challenge.status === "LOBBY" || challenge.status === "READY" || challenge.status === "ARCHIVED") {
      throw new ApiError(409, "Die Challenge läuft noch nicht.");
    }
    if (!isHost && challenge.status !== "RUNNING") {
      throw new ApiError(409, "Fortschritt kann nur während einer laufenden Challenge geändert werden.");
    }

    const game = await tx.challengeGame.findUnique({ where: { id: gameId } });
    if (!game || game.challengeId !== challenge.id) throw new ApiError(404, "Spiel nicht gefunden.");

    const team = room.teams.find((t) => t.id === teamId);
    if (!team) throw new ApiError(404, "Team nicht gefunden.");
    if (game.appliesTo !== "BOTH" && game.appliesTo !== `TEAM_${team.side}`) {
      throw new ApiError(400, "Dieses Spiel gilt nicht für dieses Team.");
    }

    if (game.requiresPreviousCompleted) {
      const previous = await tx.challengeGame.findFirst({
        where: { challengeId: challenge.id, order: { lt: game.order } },
        orderBy: { order: "desc" },
      });
      if (previous && (previous.appliesTo === "BOTH" || previous.appliesTo === `TEAM_${team.side}`)) {
        const previousProgress = await tx.teamGameProgress.findUnique({
          where: { gameId_teamId: { gameId: previous.id, teamId } },
        });
        if (!previousProgress || previousProgress.status !== "COMPLETED") {
          throw new ApiError(409, `"${previous.name}" muss zuerst abgeschlossen werden.`);
        }
      }
    }

    // Zeile sperren (legt sie bei Bedarf zuvor an) und aktuellen Wert lesen.
    await tx.teamGameProgress.upsert({
      where: { gameId_teamId: { gameId, teamId } },
      update: {},
      create: { gameId, teamId },
    });
    const locked = await tx.$queryRaw<
      { id: string; value: number; status: string; startedAt: Date | null }[]
    >(Prisma.sql`SELECT id, value, status, "startedAt" FROM "TeamGameProgress" WHERE "gameId" = ${gameId} AND "teamId" = ${teamId} FOR UPDATE`);
    const current = locked[0];
    if (!current) throw new ApiError(500, "Fortschrittszeile konnte nicht geladen werden.");

    const previousValue = current.value;
    const rawNewValue = previousValue + delta;
    const newValue = Math.min(game.targetValue, Math.max(0, rawNewValue));
    if (newValue === previousValue) {
      throw new ApiError(400, delta > 0 ? "Ziel bereits erreicht." : "Bereits beim Minimum.");
    }

    const now = new Date();
    const wasCompleted = current.status === "COMPLETED";
    const newStatus: "PENDING" | "ACTIVE" | "COMPLETED" =
      newValue >= game.targetValue ? "COMPLETED" : newValue > 0 ? "ACTIVE" : "PENDING";
    const willComplete = !wasCompleted && newStatus === "COMPLETED";

    const updatedProgress = await tx.teamGameProgress.update({
      where: { id: current.id },
      data: {
        value: newValue,
        status: newStatus,
        startedAt: current.startedAt ?? (newValue > 0 ? now : null),
        completedAt: newStatus === "COMPLETED" ? now : null,
        lastUpdatedById: actorId,
        lastUpdatedAt: now,
        version: { increment: 1 },
      },
    });

    const log = await tx.teamGameProgressLog.create({
      data: { progressId: current.id, actorId, delta, previousValue, newValue },
    });

    const unitLabel = game.progressType === "POINTS" ? "Punkt(e)" : game.progressType === "TASK" ? "" : "Sieg(e)";
    const actionWord = delta > 0 ? "eingetragen" : "korrigiert";
    const message =
      game.progressType === "TASK"
        ? `${actorName} hat „${game.name}“ für ${team.name} ${newStatus === "COMPLETED" ? "als erledigt markiert" : "zurückgesetzt"}.`
        : `${actorName} hat für ${team.name} ${Math.abs(delta)} ${unitLabel} bei „${game.name}“ ${actionWord} (${newValue}/${game.targetValue}).`;

    const activityEvent = await createActivityEvent(tx, {
      roomId,
      actorId,
      type: "PROGRESS_UPDATE",
      message,
      data: { gameId, teamId, delta, newValue, targetValue: game.targetValue, logId: log.id },
    });

    let gameCompletedEvent = null;
    let winnerNotification = null;
    let challengeFinished = false;
    let pendingWinnerTeamId: string | null = challenge.pendingWinnerTeamId;

    if (willComplete) {
      gameCompletedEvent = await createActivityEvent(tx, {
        roomId,
        actorId,
        type: "GAME_COMPLETED",
        message: `${team.name} hat „${game.name}“ abgeschlossen! 🎉`,
        data: { gameId, teamId },
      });

      // Prüfen, ob damit ALLE für dieses Team relevanten Spiele fertig sind.
      const applicableGames = await tx.challengeGame.findMany({
        where: { challengeId: challenge.id, OR: [{ appliesTo: "BOTH" }, { appliesTo: `TEAM_${team.side}` }] },
      });
      const teamProgressRows = await tx.teamGameProgress.findMany({
        where: { teamId, gameId: { in: applicableGames.map((g) => g.id) } },
      });
      const allDone =
        applicableGames.length > 0 &&
        applicableGames.every((g) => teamProgressRows.find((p) => p.gameId === g.id)?.status === "COMPLETED");

      if (allDone) {
        // Challenge-Zeile sperren, um nahezu gleichzeitige Schluss-Siege beider
        // Teams eindeutig nach Commit-Reihenfolge aufzulösen.
        const lockedChallenge = await tx.$queryRaw<{ id: string; winnerTeamId: string | null; pendingWinnerTeamId: string | null; requireHostConfirmation: boolean }[]>(
          Prisma.sql`SELECT c.id, c."winnerTeamId", c."pendingWinnerTeamId", r."requireHostConfirmation" FROM "Challenge" c JOIN "Room" r ON r.id = c."roomId" WHERE c.id = ${challenge.id} FOR UPDATE`
        );
        const freshChallenge = lockedChallenge[0];
        const alreadyDecided = Boolean(freshChallenge?.winnerTeamId || freshChallenge?.pendingWinnerTeamId);

        if (!alreadyDecided) {
          if (freshChallenge!.requireHostConfirmation) {
            await tx.challenge.update({
              where: { id: challenge.id },
              data: { pendingWinnerTeamId: teamId, pendingWinnerAt: now },
            });
            pendingWinnerTeamId = teamId;
            winnerNotification = await createNotification(tx, {
              roomId,
              type: "WINNER_PENDING",
              message: `${team.name} hat alle Spiele abgeschlossen und wartet auf Bestätigung durch den Host.`,
              data: { teamId },
            });
          } else {
            await tx.challenge.update({
              where: { id: challenge.id },
              data: {
                status: "FINISHED",
                winnerTeamId: teamId,
                winnerConfirmedAt: now,
                endedAt: now,
              },
            });
            challengeFinished = true;
            winnerNotification = await createNotification(tx, {
              roomId,
              type: "CHALLENGE_ENDED",
              message: `🏆 ${team.name} hat die Challenge gewonnen!`,
              data: { teamId },
            });
          }
        }
      }
    }

    return { progress: updatedProgress, logId: log.id, activityEvent, gameCompletedEvent, winnerNotification, challengeFinished, pendingWinnerTeamId };
  });
}

export interface UndoResult {
  progress: Awaited<ReturnType<typeof prisma.teamGameProgress.findUniqueOrThrow>>;
  activityEvent: Awaited<ReturnType<typeof createActivityEvent>>;
}

/** Macht einen einzelnen Fortschritts-Log-Eintrag rückgängig (Host-only, serverseitig geprüft im Route-Handler). */
export async function undoProgressLog(params: { roomId: string; logId: string; actorId: string; actorName: string }): Promise<UndoResult> {
  const { roomId, logId, actorId, actorName } = params;

  return prisma.$transaction(async (tx) => {
    const log = await tx.teamGameProgressLog.findUnique({
      where: { id: logId },
      include: { progress: { include: { game: true, team: true } } },
    });
    if (!log) throw new ApiError(404, "Eintrag nicht gefunden.");
    if (log.reverted) throw new ApiError(409, "Dieser Eintrag wurde bereits rückgängig gemacht.");

    const room = await tx.room.findUnique({ where: { id: roomId }, select: { id: true } });
    if (!room) throw new ApiError(404, "Raum nicht gefunden.");

    const locked = await tx.$queryRaw<{ id: string; value: number }[]>(
      Prisma.sql`SELECT id, value FROM "TeamGameProgress" WHERE id = ${log.progressId} FOR UPDATE`
    );
    const current = locked[0];
    if (!current) throw new ApiError(404, "Fortschritt nicht gefunden.");

    const game = log.progress.game;
    const previousValue = current.value;
    const newValue = Math.min(game.targetValue, Math.max(0, previousValue - log.delta));
    const now = new Date();
    const newStatus: "PENDING" | "ACTIVE" | "COMPLETED" =
      newValue >= game.targetValue ? "COMPLETED" : newValue > 0 ? "ACTIVE" : "PENDING";

    const updatedProgress = await tx.teamGameProgress.update({
      where: { id: current.id },
      data: {
        value: newValue,
        status: newStatus,
        completedAt: newStatus === "COMPLETED" ? now : null,
        lastUpdatedById: actorId,
        lastUpdatedAt: now,
        version: { increment: 1 },
      },
    });

    await tx.teamGameProgressLog.update({ where: { id: logId }, data: { reverted: true } });
    await tx.teamGameProgressLog.create({
      data: { progressId: current.id, actorId, delta: newValue - previousValue, previousValue, newValue, reverted: true },
    });

    // Falls diese Änderung einen (noch unbestätigten) vorläufigen Sieg
    // ausgelöst hatte und das Team dadurch nicht mehr komplett ist, wird die
    // vorläufige Gewinner-Markierung zurückgenommen.
    const challenge = await tx.challenge.findUnique({ where: { roomId } });
    if (challenge?.pendingWinnerTeamId === log.progress.teamId && newStatus !== "COMPLETED") {
      await tx.challenge.update({ where: { id: challenge.id }, data: { pendingWinnerTeamId: null, pendingWinnerAt: null } });
    }

    const activityEvent = await createActivityEvent(tx, {
      roomId,
      actorId,
      type: "PROGRESS_UNDO",
      message: `${actorName} hat eine Fortschrittsänderung bei „${game.name}“ rückgängig gemacht.`,
      data: { logId, gameId: game.id, teamId: log.progress.teamId },
    });

    return { progress: updatedProgress, activityEvent };
  });
}
