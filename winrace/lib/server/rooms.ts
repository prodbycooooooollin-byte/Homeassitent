import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { generateRoomCode, hashSecret, verifySecret, hashOpaqueToken } from "@/lib/codes";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createActivityEvent, createNotification } from "@/lib/server/activity";
import type { CreateRoomInput } from "@/lib/validation";

/** Erzeugt einen Raumcode, der garantiert noch nicht vergeben ist. */
async function generateUniqueRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode();
    const existing = await prisma.room.findUnique({ where: { code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new ApiError(500, "Raumcode konnte nicht erzeugt werden, bitte erneut versuchen.");
}

export async function createRoom(hostId: string, input: CreateRoomInput) {
  const code = await generateUniqueRoomCode();
  const passwordHash = await hashSecret(input.password);

  return prisma.$transaction(async (tx) => {
    const room = await tx.room.create({
      data: {
        code,
        name: input.name,
        logoUrl: input.logoUrl,
        passwordHash,
        hostId,
        maxMembersPerTeam: input.maxMembersPerTeam,
        startAt: input.startAt,
        timeLimitMinutes: input.timeLimitMinutes,
        visibility: input.visibility,
        allowMemberProgress: input.allowMemberProgress,
        onlyTeamLeadEdits: input.onlyTeamLeadEdits,
        requireHostConfirmation: input.requireHostConfirmation,
        requireJoinApproval: input.requireJoinApproval,
        teams: {
          create: [
            { side: "A", name: input.teamAName, color: input.teamAColor },
            { side: "B", name: input.teamBName, color: input.teamBColor },
          ],
        },
        challenge: { create: {} },
        members: {
          create: { userId: hostId, role: "HOST", status: "ACTIVE" },
        },
      },
      include: { teams: true, challenge: true },
    });

    await createActivityEvent(tx, {
      roomId: room.id,
      actorId: hostId,
      type: "ROOM_CREATED",
      message: `Der Raum „${room.name}“ wurde erstellt.`,
    });

    return room;
  });
}

interface JoinRoomParams {
  code: string;
  password?: string;
  inviteToken?: string;
  userId: string;
  ip: string;
}

export async function joinRoom(params: JoinRoomParams) {
  const rl = consumeRateLimit(`join:${params.ip}:${params.userId}`, RATE_LIMITS.joinAttempt.limit, RATE_LIMITS.joinAttempt.windowMs);
  if (!rl.ok) throw new ApiError(429, "Zu viele Beitrittsversuche. Bitte kurz warten.");

  const room = await prisma.room.findUnique({ where: { code: params.code.trim().toUpperCase() } });
  if (!room || room.isArchived) throw new ApiError(404, "Raum nicht gefunden.");

  let usedInvite: { id: string } | null = null;

  if (params.inviteToken) {
    const tokenHash = hashOpaqueToken(params.inviteToken);
    const invite = await prisma.roomInvite.findUnique({ where: { tokenHash } });
    if (!invite || invite.roomId !== room.id) throw new ApiError(403, "Einladung ungültig.");
    if (invite.revokedAt) throw new ApiError(403, "Diese Einladung wurde widerrufen.");
    if (invite.expiresAt && invite.expiresAt < new Date()) throw new ApiError(403, "Diese Einladung ist abgelaufen.");
    if (invite.useCount >= invite.maxUses) throw new ApiError(403, "Diese Einladung wurde bereits vollständig genutzt.");
    usedInvite = invite;
  } else if (params.password) {
    const valid = await verifySecret(params.password, room.passwordHash);
    if (!valid) throw new ApiError(403, "Falscher Raumcode oder falsches Passwort.");
  } else {
    throw new ApiError(400, "Passwort oder Einladung erforderlich.");
  }

  const existing = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId: room.id, userId: params.userId } } });
  if (existing?.status === "BANNED") throw new ApiError(403, "Du wurdest aus diesem Raum ausgeschlossen.");

  const initialStatus = room.requireJoinApproval && !existing ? "PENDING" : "ACTIVE";

  const member = await prisma.$transaction(async (tx) => {
    if (usedInvite) {
      await tx.roomInvite.update({ where: { id: usedInvite.id }, data: { useCount: { increment: 1 } } });
    }

    const upserted = existing
      ? await tx.roomMember.update({
          where: { id: existing.id },
          data: existing.status === "REMOVED" ? { status: initialStatus } : {},
        })
      : await tx.roomMember.create({
          data: { roomId: room.id, userId: params.userId, status: initialStatus, role: "SPECTATOR" },
        });

    const user = await tx.user.findUnique({ where: { id: params.userId } });
    await createActivityEvent(tx, {
      roomId: room.id,
      actorId: params.userId,
      type: initialStatus === "PENDING" ? "JOIN_REQUESTED" : "MEMBER_JOINED",
      message:
        initialStatus === "PENDING"
          ? `${user?.displayName} möchte dem Raum beitreten (wartet auf Bestätigung).`
          : `${user?.displayName} ist dem Raum beigetreten.`,
    });

    let notification = null;
    if (initialStatus === "PENDING") {
      notification = await createNotification(tx, {
        roomId: room.id,
        userId: room.hostId,
        type: "JOIN_REQUESTED",
        message: `${user?.displayName} möchte dem Raum beitreten.`,
      });
    }

    return { upserted, notification };
  });

  return { room, member: member.upserted, notification: member.notification };
}

/** Öffentlich sichere Vorschau eines Raums (für Join-/Invite-Seiten) – keine sensiblen Daten. */
export async function getRoomPreview(code: string) {
  const room = await prisma.room.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: {
      host: { select: { displayName: true } },
      teams: { select: { side: true, name: true, color: true, locked: true, _count: { select: { members: true } } } },
      challenge: { select: { status: true } },
    },
  });
  if (!room || room.isArchived) return null;

  return {
    code: room.code,
    name: room.name,
    logoUrl: room.logoUrl,
    hostName: room.host.displayName,
    maxMembersPerTeam: room.maxMembersPerTeam,
    visibility: room.visibility,
    status: room.challenge?.status ?? "LOBBY",
    requireJoinApproval: room.requireJoinApproval,
    teams: room.teams.map((t) => ({ side: t.side, name: t.name, color: t.color, locked: t.locked, memberCount: t._count.members })),
  };
}

/** Löst einen Einladungslink auf (ohne die Einladung zu verbrauchen) für die Vorschau-/Landingpage. */
export async function getInvitePreview(token: string) {
  const tokenHash = hashOpaqueToken(token);
  const invite = await prisma.roomInvite.findUnique({ where: { tokenHash }, include: { room: true } });
  if (!invite) return null;

  const now = new Date();
  const valid = !invite.revokedAt && (!invite.expiresAt || invite.expiresAt > now) && invite.useCount < invite.maxUses;
  const roomPreview = await getRoomPreview(invite.room.code);
  if (!roomPreview) return null;

  return { valid, label: invite.label, room: roomPreview };
}
