import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { Server } from "socket.io";
import { setIO, roomChannel } from "@/lib/socket-server";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl);
  });

  // Ein einziger kombinierter Node-Prozess für Next.js (SSR/API-Routes) und
  // Socket.io (Echtzeit) – so können API-Route-Handler nach einer
  // erfolgreichen DB-Schreiboperation direkt über `emitToRoom(...)` Events
  // an alle im selben Raum verbundenen Clients senden, ohne einen externen
  // Message-Broker zu benötigen. Für einen horizontal skalierten Betrieb
  // (mehrere Instanzen) müsste hier zusätzlich der Socket.io-Redis-Adapter
  // eingebunden werden.
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: false },
  });

  // Einfache In-Memory-Präsenz (welche Nutzer-IDs sind gerade in welchem
  // Raum verbunden) – ausreichend für eine einzelne Instanz, siehe
  // Kommentar zu rate-limit.ts für die gleiche Einschränkung bei
  // horizontaler Skalierung.
  const presence = new Map<string, Map<string, Set<string>>>();

  function broadcastPresence(roomId: string) {
    const roomMap = presence.get(roomId);
    io.to(roomChannel(roomId)).emit("presence:updated", roomMap ? Array.from(roomMap.keys()) : []);
  }

  function addPresence(roomId: string, userId: string, socketId: string) {
    let roomMap = presence.get(roomId);
    if (!roomMap) {
      roomMap = new Map();
      presence.set(roomId, roomMap);
    }
    let sockets = roomMap.get(userId);
    if (!sockets) {
      sockets = new Set();
      roomMap.set(userId, sockets);
    }
    sockets.add(socketId);
    broadcastPresence(roomId);
  }

  function removePresence(roomId: string, userId: string, socketId: string) {
    const roomMap = presence.get(roomId);
    const sockets = roomMap?.get(userId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) roomMap!.delete(userId);
    broadcastPresence(roomId);
  }

  io.on("connection", (socket) => {
    const presenceLinks: { roomId: string; userId: string }[] = [];

    socket.on("join:room", (roomId: unknown) => {
      if (typeof roomId === "string" && roomId.length < 100) {
        socket.join(roomChannel(roomId));
      }
    });
    socket.on("leave:room", (roomId: unknown) => {
      if (typeof roomId === "string") socket.leave(roomChannel(roomId));
    });
    socket.on("join:user", (userId: unknown) => {
      if (typeof userId === "string" && userId.length < 100) {
        socket.join(`user:${userId}`);
      }
    });
    socket.on("presence:hello", (payload: unknown) => {
      const { roomId, userId } = (payload as { roomId?: string; userId?: string }) ?? {};
      if (typeof roomId === "string" && typeof userId === "string") {
        presenceLinks.push({ roomId, userId });
        addPresence(roomId, userId, socket.id);
      }
    });
    socket.on("disconnect", () => {
      for (const { roomId, userId } of presenceLinks) removePresence(roomId, userId, socket.id);
    });
  });

  setIO(io);

  httpServer.listen(port, () => {
    console.log(`> WinRace läuft auf http://${hostname}:${port} (${dev ? "Entwicklung" : "Produktion"})`);
  });
});
