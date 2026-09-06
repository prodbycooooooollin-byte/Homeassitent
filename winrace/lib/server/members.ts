import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { createActivityEvent, createNotification } from "@/lib/server/activity";
import type { TeamSide } from "@prisma/client";

export async function listMembers(roomId: string) {
  return prisma.roomMember.findMany({
    where: { roomId },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } }, team: true },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });
}

async function loadRoomAndMember(roomId: string, memberId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, include: { teams: true } });
  if (!room) throw new ApiError(404, "Raum nicht gefunden.");
  const member = await prisma.roomMember.findUnique({ where: { id: memberId }, include: { user: true } });
  if (!member || member.roomId !== roomId) throw new ApiError(404, "Mitglied nicht gefunden.");
  return { room, member };
}

async function assignTeamInternal(roomId: string, memberId: string, side: TeamSide | null, actorUserId: string | null, bypassLock: boolean) {
  const { room, member } = await loadRoomAndMember(roomId, memberId);
  if (member.role === "HOST") throw new ApiError(400, "Der Host ist kein Teammitglied.");
  if (member.status !== "ACTIVE") throw new ApiError(409, "Mitgliedschaft ist nicht aktiv.");
  if (!bypassLock && room.teamsLocked) throw new ApiError(403, "Die Teams sind gesperrt.");
  // Beim Self-Service ist die Mitgliedschaft selbst der Akteur (actorUserId
  // ist dann null); beim Host-Zuweisen wird die aufrufende Host-User-ID übergeben.
  const actorId = actorUserId ?? member.userId;

  return prisma.$transaction(async (tx) => {
    let teamId: string | null = null;
    let teamName = "die Zuschauer";
    if (side) {
      const team = room.teams.find((t) => t.side === side);
      if (!team) throw new ApiError(404, "Team nicht gefunden.");
      if (team.locked && !bypassLock) throw new ApiError(403, `${team.name} ist gesperrt.`);
      const count = await tx.roomMember.count({ where: { teamId: team.id, status: "ACTIVE" } });
      if (member.teamId !== team.id && count >= room.maxMembersPerTeam) {
        throw new ApiError(409, `${team.name} ist bereits voll.`);
      }
      teamId = team.id;
      teamName = team.name;
    }

    const updated = await tx.roomMember.update({
      where: { id: memberId },
      data: { teamId, role: teamId ? "MEMBER" : "SPECTATOR", isTeamLead: false },
    });

    await createActivityEvent(tx, {
      roomId,
      actorId,
      type: "TEAM_ASSIGNED",
      message: side ? `${member.user.displayName} ist ${teamName} beigetreten.` : `${member.user.displayName} hat das Team verlassen.`,
    });

    return updated;
  });
}

export function selfAssignTeam(roomId: string, memberId: string, side: TeamSide | null) {
  return assignTeamInternal(roomId, memberId, side, null, false);
}

export function hostAssignMember(roomId: string, memberId: string, side: TeamSide | null, actorId: string) {
  return assignTeamInternal(roomId, memberId, side, actorId, true);
}

export async function promoteToLead(roomId: string, memberId: string, actorId: string) {
  const { member } = await loadRoomAndMember(roomId, memberId);
  if (!member.teamId) throw new ApiError(400, "Mitglied ist keinem Team zugeordnet.");

  return prisma.$transaction(async (tx) => {
    await tx.roomMember.updateMany({
      where: { roomId, teamId: member.teamId, isTeamLead: true },
      data: { isTeamLead: false, role: "MEMBER" },
    });
    const updated = await tx.roomMember.update({ where: { id: memberId }, data: { isTeamLead: true, role: "TEAM_LEAD" } });
    await createActivityEvent(tx, { roomId, actorId, type: "LEAD_ASSIGNED", message: `${member.user.displayName} wurde zum Team-Lead ernannt.` });
    return updated;
  });
}

export async function demoteToMember(roomId: string, memberId: string, actorId: string) {
  const { member } = await loadRoomAndMember(roomId, memberId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.roomMember.update({ where: { id: memberId }, data: { isTeamLead: false, role: member.teamId ? "MEMBER" : "SPECTATOR" } });
    await createActivityEvent(tx, { roomId, actorId, type: "LEAD_REMOVED", message: `${member.user.displayName} ist nicht mehr Team-Lead.` });
    return updated;
  });
}

export async function removeMember(roomId: string, memberId: string, actorId: string) {
  const { member } = await loadRoomAndMember(roomId, memberId);
  if (member.role === "HOST") throw new ApiError(400, "Der Host kann nicht entfernt werden.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.roomMember.update({
      where: { id: memberId },
      data: { status: "REMOVED", teamId: null, isTeamLead: false },
    });
    await createActivityEvent(tx, { roomId, actorId, type: "MEMBER_REMOVED", message: `${member.user.displayName} wurde aus dem Raum entfernt.` });
    return updated;
  });
}

export async function approveJoinRequest(roomId: string, memberId: string, actorId: string) {
  const { member } = await loadRoomAndMember(roomId, memberId);
  if (member.status !== "PENDING") throw new ApiError(409, "Kein offener Beitrittswunsch.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.roomMember.update({ where: { id: memberId }, data: { status: "ACTIVE" } });
    await createActivityEvent(tx, { roomId, actorId, type: "JOIN_APPROVED", message: `${member.user.displayName} wurde in den Raum aufgenommen.` });
    const notification = await createNotification(tx, { roomId, userId: member.userId, type: "JOIN_APPROVED", message: "Dein Beitritt wurde bestätigt." });
    return { member: updated, notification };
  });
}

export async function setTeamsLocked(roomId: string, locked: boolean, actorId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.room.update({ where: { id: roomId }, data: { teamsLocked: locked } });
    const activityEvent = await createActivityEvent(tx, {
      roomId,
      actorId,
      type: "TEAMS_LOCK_CHANGED",
      message: locked ? "Der Host hat die Teams gesperrt." : "Der Host hat die Teams entsperrt.",
    });
    return activityEvent;
  });
}

export async function updateMemberTwitchOverride(roomId: string, memberId: string, login: string | null, actorId: string) {
  const { member } = await loadRoomAndMember(roomId, memberId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.roomMember.update({ where: { id: memberId }, data: { twitchLoginOverride: login } });
    await createActivityEvent(tx, {
      roomId,
      actorId,
      type: "TWITCH_UPDATED",
      message: `Twitch-Kanal von ${member.user.displayName} wurde aktualisiert.`,
    });
    return updated;
  });
}
