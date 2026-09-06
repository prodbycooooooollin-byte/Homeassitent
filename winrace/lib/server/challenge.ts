import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { createActivityEvent, createNotification } from "@/lib/server/activity";
import type { GameInput } from "@/lib/validation";

async function requireChallenge(roomId: string) {
  const challenge = await prisma.challenge.findUnique({ where: { roomId } });
  if (!challenge) throw new ApiError(404, "Challenge nicht gefunden.");
  return challenge;
}

// --- Spiele-CRUD ------------------------------------------------------

export async function listGames(roomId: string) {
  const challenge = await requireChallenge(roomId);
  return prisma.challengeGame.findMany({ where: { challengeId: challenge.id }, orderBy: { order: "asc" } });
}

export async function addGame(roomId: string, input: GameInput, actorId: string) {
  const challenge = await requireChallenge(roomId);
  return prisma.$transaction(async (tx) => {
    const last = await tx.challengeGame.findFirst({ where: { challengeId: challenge.id }, orderBy: { order: "desc" } });
    const game = await tx.challengeGame.create({
      data: { ...input, challengeId: challenge.id, order: (last?.order ?? 0) + 1 },
    });
    const teams = await tx.team.findMany({ where: { roomId } });
    await tx.teamGameProgress.createMany({
      data: teams
        .filter((t) => game.appliesTo === "BOTH" || game.appliesTo === `TEAM_${t.side}`)
        .map((t) => ({ gameId: game.id, teamId: t.id })),
    });
    await createActivityEvent(tx, { roomId, actorId, type: "GAME_ADDED", message: `Spiel „${game.name}“ wurde hinzugefügt.` });
    return game;
  });
}

export async function updateGame(roomId: string, gameId: string, input: Partial<GameInput>, actorId: string) {
  const game = await prisma.challengeGame.findUnique({ where: { id: gameId }, include: { challenge: true } });
  if (!game || game.challenge.roomId !== roomId) throw new ApiError(404, "Spiel nicht gefunden.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.challengeGame.update({ where: { id: gameId }, data: input });

    // Falls sich appliesTo geändert hat, fehlende Fortschritts-Zeilen ergänzen.
    if (input.appliesTo && input.appliesTo !== game.appliesTo) {
      const teams = await tx.team.findMany({ where: { roomId } });
      const relevant = teams.filter((t) => updated.appliesTo === "BOTH" || updated.appliesTo === `TEAM_${t.side}`);
      for (const t of relevant) {
        await tx.teamGameProgress.upsert({
          where: { gameId_teamId: { gameId, teamId: t.id } },
          update: {},
          create: { gameId, teamId: t.id },
        });
      }
    }

    await createActivityEvent(tx, { roomId, actorId, type: "GAME_UPDATED", message: `Spiel „${updated.name}“ wurde bearbeitet.` });
    return updated;
  });
}

export async function deleteGame(roomId: string, gameId: string, actorId: string) {
  const game = await prisma.challengeGame.findUnique({ where: { id: gameId }, include: { challenge: true } });
  if (!game || game.challenge.roomId !== roomId) throw new ApiError(404, "Spiel nicht gefunden.");

  return prisma.$transaction(async (tx) => {
    await tx.challengeGame.delete({ where: { id: gameId } });
    await createActivityEvent(tx, { roomId, actorId, type: "GAME_DELETED", message: `Spiel „${game.name}“ wurde entfernt.` });
  });
}

export async function duplicateGame(roomId: string, gameId: string, actorId: string) {
  const game = await prisma.challengeGame.findUnique({ where: { id: gameId }, include: { challenge: true } });
  if (!game || game.challenge.roomId !== roomId) throw new ApiError(404, "Spiel nicht gefunden.");

  const { id, createdAt, updatedAt, challengeId, order, ...rest } = game;
  return addGame(roomId, { ...rest, name: `${game.name} (Kopie)` } as GameInput, actorId);
}

export async function reorderGames(roomId: string, orderedIds: string[], actorId: string) {
  const challenge = await requireChallenge(roomId);
  const games = await prisma.challengeGame.findMany({ where: { challengeId: challenge.id } });
  const validIds = new Set(games.map((g) => g.id));
  if (orderedIds.length !== games.length || !orderedIds.every((id) => validIds.has(id))) {
    throw new ApiError(400, "Ungültige Sortierreihenfolge.");
  }

  await prisma.$transaction([
    ...orderedIds.map((id, index) => prisma.challengeGame.update({ where: { id }, data: { order: index + 1 } })),
    prisma.activityEvent.create({
      data: { roomId, actorId, type: "GAMES_REORDERED", message: "Die Spiele-Reihenfolge wurde geändert." },
    }),
  ]);
}

// --- Lifecycle ----------------------------------------------------------

export async function startChallenge(roomId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId }, include: { challenge: { include: { games: true } }, teams: { include: { members: true } } } });
    if (!room || !room.challenge) throw new ApiError(404, "Raum nicht gefunden.");
    if (!["LOBBY", "READY"].includes(room.challenge.status)) throw new ApiError(409, "Die Challenge läuft bereits oder ist beendet.");
    if (room.challenge.games.length === 0) throw new ApiError(400, "Bitte zuerst mindestens ein Spiel anlegen.");
    const emptyTeam = room.teams.find((t) => t.members.length === 0);
    if (emptyTeam) throw new ApiError(400, `${emptyTeam.name} hat noch keine Mitglieder.`);

    const challenge = await tx.challenge.update({
      where: { id: room.challenge.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    await tx.room.update({ where: { id: roomId }, data: { teamsLocked: true } });
    const activityEvent = await createActivityEvent(tx, { roomId, actorId, type: "CHALLENGE_STARTED", message: "Die Challenge wurde gestartet. Viel Erfolg! 🚀" });
    return { challenge, activityEvent };
  });
}

export async function markReady(roomId: string, actorId: string) {
  const challenge = await requireChallenge(roomId);
  if (challenge.status !== "LOBBY") throw new ApiError(409, "Nur aus der Lobby heraus möglich.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.challenge.update({ where: { id: challenge.id }, data: { status: "READY" } });
    const activityEvent = await createActivityEvent(tx, { roomId, actorId, type: "CHALLENGE_READY", message: "Der Host hat die Challenge als bereit markiert." });
    return { challenge: updated, activityEvent };
  });
}

export async function pauseChallenge(roomId: string, actorId: string) {
  const challenge = await requireChallenge(roomId);
  if (challenge.status !== "RUNNING") throw new ApiError(409, "Die Challenge läuft gerade nicht.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.challenge.update({ where: { id: challenge.id }, data: { status: "PAUSED", pausedAt: new Date() } });
    const activityEvent = await createActivityEvent(tx, { roomId, actorId, type: "CHALLENGE_PAUSED", message: "Der Host hat die Challenge pausiert." });
    const notification = await createNotification(tx, { roomId, type: "CHALLENGE_PAUSED", message: "Challenge pausiert." });
    return { challenge: updated, activityEvent, notification };
  });
}

export async function resumeChallenge(roomId: string, actorId: string) {
  const challenge = await requireChallenge(roomId);
  if (challenge.status !== "PAUSED") throw new ApiError(409, "Die Challenge ist nicht pausiert.");
  const now = new Date();
  const additionalPause = challenge.pausedAt ? now.getTime() - challenge.pausedAt.getTime() : 0;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.challenge.update({
      where: { id: challenge.id },
      data: { status: "RUNNING", pausedAt: null, totalPausedMs: { increment: BigInt(Math.max(0, additionalPause)) } },
    });
    const activityEvent = await createActivityEvent(tx, { roomId, actorId, type: "CHALLENGE_RESUMED", message: "Der Host hat die Challenge fortgesetzt." });
    const notification = await createNotification(tx, { roomId, type: "CHALLENGE_RESUMED", message: "Challenge fortgesetzt." });
    return { challenge: updated, activityEvent, notification };
  });
}

export async function endChallenge(roomId: string, actorId: string, winnerTeamId?: string | null) {
  const challenge = await requireChallenge(roomId);
  if (["FINISHED", "ARCHIVED"].includes(challenge.status)) throw new ApiError(409, "Die Challenge ist bereits beendet.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.challenge.update({
      where: { id: challenge.id },
      data: { status: "FINISHED", endedAt: new Date(), winnerTeamId: winnerTeamId ?? null, winnerConfirmedAt: winnerTeamId ? new Date() : null, pendingWinnerTeamId: null, pendingWinnerAt: null },
    });
    const activityEvent = await createActivityEvent(tx, { roomId, actorId, type: "CHALLENGE_ENDED", message: "Der Host hat die Challenge beendet." });
    return { challenge: updated, activityEvent };
  });
}

export async function confirmWinner(roomId: string, actorId: string) {
  const challenge = await requireChallenge(roomId);
  if (!challenge.pendingWinnerTeamId) throw new ApiError(409, "Es liegt kein vorläufiger Sieger vor.");
  const team = await prisma.team.findUnique({ where: { id: challenge.pendingWinnerTeamId } });

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.challenge.update({
      where: { id: challenge.id },
      data: {
        status: "FINISHED",
        winnerTeamId: challenge.pendingWinnerTeamId,
        winnerConfirmedAt: now,
        endedAt: now,
        pendingWinnerTeamId: null,
        pendingWinnerAt: null,
      },
    });
    const activityEvent = await createActivityEvent(tx, {
      roomId,
      actorId,
      type: "WINNER_CONFIRMED",
      message: `Der Host hat ${team?.name ?? "das Team"} als Sieger bestätigt! 🏆`,
    });
    const notification = await createNotification(tx, { roomId, type: "CHALLENGE_ENDED", message: `🏆 ${team?.name ?? "Ein Team"} hat gewonnen – vom Host bestätigt.` });
    return { challenge: updated, activityEvent, notification };
  });
}

export async function archiveChallenge(roomId: string, actorId: string) {
  const challenge = await requireChallenge(roomId);
  if (challenge.status !== "FINISHED") throw new ApiError(409, "Nur beendete Challenges können archiviert werden.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.challenge.update({ where: { id: challenge.id }, data: { status: "ARCHIVED" } });
    await tx.room.update({ where: { id: roomId }, data: { isArchived: true } });
    const activityEvent = await createActivityEvent(tx, { roomId, actorId, type: "ROOM_ARCHIVED", message: "Der Raum wurde archiviert." });
    return { challenge: updated, activityEvent };
  });
}
