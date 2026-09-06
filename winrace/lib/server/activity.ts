import type { Prisma, PrismaClient } from "@prisma/client";
import { emitToRoom } from "@/lib/socket-server";

type TxClient = PrismaClient | Prisma.TransactionClient;

interface ActivityInput {
  roomId: string;
  actorId?: string | null;
  type: string;
  message: string;
  data?: Record<string, unknown>;
}

/** Legt einen Eintrag im Audit-/Aktivitätsprotokoll an (innerhalb einer Transaktion aufrufbar). */
export async function createActivityEvent(tx: TxClient, input: ActivityInput) {
  return tx.activityEvent.create({
    data: {
      roomId: input.roomId,
      actorId: input.actorId ?? null,
      type: input.type,
      message: input.message,
      data: (input.data as Prisma.InputJsonValue) ?? undefined,
    },
    include: { actor: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
}

interface NotificationInput {
  roomId?: string | null;
  userId?: string | null;
  type: string;
  message: string;
  data?: Record<string, unknown>;
}

export async function createNotification(tx: TxClient, input: NotificationInput) {
  return tx.notification.create({
    data: {
      roomId: input.roomId ?? null,
      userId: input.userId ?? null,
      type: input.type,
      message: input.message,
      data: (input.data as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

/** Sendet Aktivitäts-/Benachrichtigungs-Events NACH erfolgreichem Commit an alle Raum-Clients. */
export function broadcastActivity(roomId: string, event: unknown) {
  emitToRoom(roomId, "activity:new", event);
}

export function broadcastNotification(roomId: string, notification: unknown) {
  emitToRoom(roomId, "notification:new", notification);
}
