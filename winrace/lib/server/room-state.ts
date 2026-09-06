import { prisma } from "@/lib/prisma";
import { computeElapsedMs, computeRemainingMs } from "@/lib/time";
import {
  canManageRoom,
  canManageMembers,
  canManageOverlay,
  canConfirmWinner,
  canUpdateTeamProgress,
  canSelfAssignTeam,
  type PermissionMember,
} from "@/lib/server/permissions";
import type { RoomRole, MemberStatus } from "@prisma/client";

export interface ViewerMember {
  id: string;
  role: RoomRole;
  status: MemberStatus;
  isTeamLead: boolean;
  teamId: string | null;
}

/**
 * Lädt den vollständigen, für den aktuellen Betrachter freigegebenen
 * Raumzustand. Wird sowohl von Server Components (direkter Aufruf, kein
 * Netzwerk-Roundtrip) als auch vom `/state`-Route-Handler (für den
 * Reconnect-Refetch im Client) verwendet – eine einzige Quelle der
 * Wahrheit für "was darf dieser Betrachter sehen".
 */
export async function getRoomState(code: string, viewerUserId: string | null, options?: { forceFullDetails?: boolean }) {
  const room = await prisma.room.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: {
      host: { select: { id: true, displayName: true, avatarUrl: true } },
      teams: {
        include: {
          members: {
            where: { status: { in: ["ACTIVE", "PENDING"] } },
            include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
            orderBy: { joinedAt: "asc" },
          },
        },
      },
      challenge: { include: { games: { orderBy: { order: "asc" }, include: { progress: true } } } },
    },
  });
  if (!room) return null;

  const viewerMember = viewerUserId
    ? await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId: room.id, userId: viewerUserId } } })
    : null;

  const isPrivilegedViewer = Boolean(viewerMember && viewerMember.status === "ACTIVE");
  const canSeeFullDetails = Boolean(options?.forceFullDetails) || room.visibility === "PUBLIC" || isPrivilegedViewer || room.isDemo;

  const permMember: PermissionMember | null = viewerMember
    ? { role: viewerMember.role, status: viewerMember.status, isTeamLead: viewerMember.isTeamLead, teamId: viewerMember.teamId }
    : null;
  const settings = {
    allowMemberProgress: room.allowMemberProgress,
    onlyTeamLeadEdits: room.onlyTeamLeadEdits,
    teamsLocked: room.teamsLocked,
  };

  const now = new Date();
  const elapsedMs = room.challenge ? computeElapsedMs(room.challenge, now) : 0;
  const remainingMs = room.challenge ? computeRemainingMs({ ...room.challenge, timeLimitMinutes: room.timeLimitMinutes }, now) : null;

  return {
    canSeeFullDetails,
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      logoUrl: room.logoUrl,
      visibility: room.visibility,
      maxMembersPerTeam: room.maxMembersPerTeam,
      startAt: room.startAt,
      timeLimitMinutes: room.timeLimitMinutes,
      allowMemberProgress: room.allowMemberProgress,
      onlyTeamLeadEdits: room.onlyTeamLeadEdits,
      requireHostConfirmation: room.requireHostConfirmation,
      requireJoinApproval: room.requireJoinApproval,
      teamsLocked: room.teamsLocked,
      isDemo: room.isDemo,
      isArchived: room.isArchived,
      hostId: room.hostId,
      hostName: room.host.displayName,
    },
    teams: room.teams.map((t) => ({
      id: t.id,
      side: t.side,
      name: t.name,
      color: t.color,
      locked: t.locked,
      currentGameId: t.currentGameId,
      memberCount: t.members.filter((m) => m.status === "ACTIVE").length,
      members: canSeeFullDetails
        ? t.members.map((m) => ({
            id: m.id,
            userId: m.userId,
            displayName: m.user.displayName,
            avatarUrl: m.user.avatarUrl,
            role: m.role,
            isTeamLead: m.isTeamLead,
            status: m.status,
            twitchLogin: m.twitchLoginOverride,
            joinedAt: m.joinedAt,
          }))
        : [],
    })),
    challenge: room.challenge
      ? {
          id: room.challenge.id,
          status: room.challenge.status,
          startedAt: room.challenge.startedAt,
          pausedAt: room.challenge.pausedAt,
          endedAt: room.challenge.endedAt,
          winnerTeamId: room.challenge.winnerTeamId,
          winnerConfirmedAt: room.challenge.winnerConfirmedAt,
          pendingWinnerTeamId: room.challenge.pendingWinnerTeamId,
          pendingWinnerAt: room.challenge.pendingWinnerAt,
          elapsedMs,
          remainingMs,
          games: room.challenge.games.map((g) => ({
            id: g.id,
            order: g.order,
            name: g.name,
            coverUrl: g.coverUrl,
            progressType: g.progressType,
            targetValue: g.targetValue,
            timeLimitMinutes: g.timeLimitMinutes,
            rulesText: g.rulesText,
            appliesTo: g.appliesTo,
            difficulty: g.difficulty,
            bonusPoints: g.bonusPoints,
            requireEvidence: g.requireEvidence,
            requiresPreviousCompleted: g.requiresPreviousCompleted,
            progress: Object.fromEntries(
              g.progress.map((p) => [
                p.teamId,
                {
                  id: p.id,
                  value: p.value,
                  status: p.status,
                  startedAt: p.startedAt,
                  completedAt: p.completedAt,
                  lastUpdatedById: p.lastUpdatedById,
                  lastUpdatedAt: p.lastUpdatedAt,
                },
              ])
            ),
          })),
        }
      : null,
    viewer: {
      userId: viewerUserId,
      member: viewerMember
        ? {
            id: viewerMember.id,
            role: viewerMember.role,
            status: viewerMember.status,
            isTeamLead: viewerMember.isTeamLead,
            teamId: viewerMember.teamId,
          }
        : null,
      permissions: {
        canManageRoom: canManageRoom(permMember),
        canManageMembers: canManageMembers(permMember),
        canManageOverlay: canManageOverlay(permMember),
        canConfirmWinner: canConfirmWinner(permMember),
        canSelfAssignTeam: canSelfAssignTeam(permMember, settings),
        canUpdateTeamA: room.teams[0] ? canUpdateTeamProgress(permMember, room.teams.find((t) => t.side === "A")!.id, settings) : false,
        canUpdateTeamB: room.teams[0] ? canUpdateTeamProgress(permMember, room.teams.find((t) => t.side === "B")!.id, settings) : false,
      },
    },
  };
}

export type RoomState = NonNullable<Awaited<ReturnType<typeof getRoomState>>>;
