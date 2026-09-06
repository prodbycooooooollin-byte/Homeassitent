import type { Server as IOServer } from "socket.io";

/**
 * server.ts (unser kombinierter Next.js + Socket.io Prozess) registriert die
 * Server-Instanz hier über `setIO`. API-Route-Handler laufen im selben
 * Node-Prozess und können sie darüber abrufen, um nach einer erfolgreichen
 * DB-Mutation Echtzeit-Events zu senden – ganz ohne zusätzliche
 * Message-Queue.
 */
const globalForIO = globalThis as unknown as { __winraceIO?: IOServer };

export function setIO(io: IOServer) {
  globalForIO.__winraceIO = io;
}

export function getIO(): IOServer | undefined {
  return globalForIO.__winraceIO;
}

/** Kanalname für Raum-weite Events (Teilnehmer, Zuschauer, Overlays). */
export function roomChannel(roomId: string) {
  return `room:${roomId}`;
}

export type RealtimeEvent =
  | "room:updated"
  | "members:updated"
  | "teams:updated"
  | "challenge:updated"
  | "games:updated"
  | "progress:updated"
  | "activity:new"
  | "notification:new"
  | "winner:pending"
  | "winner:confirmed"
  | "presence:updated";

/** Sendet ein Event an alle Clients (Teilnehmer, Zuschauer, Overlays), die dem Raum beigetreten sind. */
export function emitToRoom(roomId: string, event: RealtimeEvent, payload: unknown) {
  const io = getIO();
  if (!io) return;
  io.to(roomChannel(roomId)).emit(event, payload);
}

/** Sendet ein Event gezielt an einen eingeloggten Nutzer (alle seine offenen Tabs/Geräte). */
export function emitToUser(userId: string, event: RealtimeEvent, payload: unknown) {
  const io = getIO();
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}
