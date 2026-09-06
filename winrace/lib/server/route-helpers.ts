import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { getCurrentUser, getRoomMembership } from "@/lib/session";

export async function requireRoomByCode(code: string) {
  const room = await prisma.room.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!room) throw new ApiError(404, "Raum nicht gefunden.");
  return room;
}

/** Nutzer muss eingeloggt sein; Mitgliedschaft ist optional (z.B. für Zuschauer-Beitritt). */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Bitte melde dich an.");
  return user;
}

export async function loadRoomContext(code: string) {
  const user = await requireUser();
  const room = await requireRoomByCode(code);
  const member = await getRoomMembership(room.id, user.id);
  return { user, room, member };
}

/** Wie loadRoomContext, verlangt aber eine aktive Mitgliedschaft im Raum. */
export async function requireActiveMember(code: string) {
  const ctx = await loadRoomContext(code);
  if (!ctx.member || ctx.member.status !== "ACTIVE") {
    throw new ApiError(403, "Du bist kein aktives Mitglied dieses Raums.");
  }
  return { ...ctx, member: ctx.member };
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
