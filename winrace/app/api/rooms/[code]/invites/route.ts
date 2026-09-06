import { prisma } from "@/lib/prisma";
import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { loadRoomContext } from "@/lib/server/route-helpers";
import { canManageMembers } from "@/lib/server/permissions";
import { createInviteSchema } from "@/lib/validation";
import { generateOpaqueToken } from "@/lib/codes";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { room, member } = await loadRoomContext(params.code);
    if (!canManageMembers(member)) throw new ApiError(403, "Nur der Host verwaltet Einladungen.");

    const invites = await prisma.roomInvite.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "desc" } });
    return jsonOk({
      invites: invites.map((i) => ({
        id: i.id,
        label: i.label,
        maxUses: i.maxUses,
        useCount: i.useCount,
        expiresAt: i.expiresAt,
        revokedAt: i.revokedAt,
        createdAt: i.createdAt,
      })),
    });
  });
}

export async function POST(req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { user, room, member } = await loadRoomContext(params.code);
    if (!canManageMembers(member)) throw new ApiError(403, "Nur der Host erstellt Einladungen.");

    const rl = consumeRateLimit(`invite:${user.id}`, RATE_LIMITS.invite.limit, RATE_LIMITS.invite.windowMs);
    if (!rl.ok) throw new ApiError(429, "Zu viele Einladungen erstellt. Bitte kurz warten.");

    const input = await parseBody(req, createInviteSchema);
    const { token, tokenHash } = generateOpaqueToken();

    const invite = await prisma.roomInvite.create({
      data: {
        roomId: room.id,
        tokenHash,
        createdById: user.id,
        label: input.label,
        maxUses: input.maxUses,
        expiresAt: input.expiresInHours ? new Date(Date.now() + input.expiresInHours * 3600_000) : null,
      },
    });

    const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/invite/${token}`;
    return jsonOk({ id: invite.id, token, inviteUrl }, 201);
  });
}
