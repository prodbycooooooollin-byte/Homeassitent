"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket-client";
import type { RealtimeEvent } from "@/lib/socket-server";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface UseRoomRealtimeOptions {
  /** Wird beim ersten Verbindungsaufbau NICHT, aber bei jeder Wiederherstellung danach aufgerufen –
   * so kann die Seite den aktuellen Zustand nachladen (verpasste Events während der Trennung). */
  onReconnect?: () => void;
  userId?: string | null;
}

/**
 * Verbindet mit dem Socket.io-Server, tritt dem Echtzeit-Kanal eines Raums
 * bei und liefert den Verbindungsstatus für die "Verbindung getrennt"-
 * Anzeige. Reconnects lösen `onReconnect` aus, damit UI-States nie
 * dauerhaft veraltet bleiben.
 */
export function useRoomRealtime(roomId: string | null | undefined, options: UseRoomRealtimeOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const hasConnectedOnce = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();

    const join = () => {
      socket.emit("join:room", roomId);
      if (optionsRef.current.userId) {
        socket.emit("join:user", optionsRef.current.userId);
        socket.emit("presence:hello", { roomId, userId: optionsRef.current.userId });
      }
      setStatus("connected");
      if (hasConnectedOnce.current) {
        optionsRef.current.onReconnect?.();
      }
      hasConnectedOnce.current = true;
    };

    if (socket.connected) join();
    socket.on("connect", join);
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.io.on("reconnect_attempt", () => setStatus("connecting"));

    return () => {
      socket.emit("leave:room", roomId);
      socket.off("connect", join);
    };
  }, [roomId]);

  return { status, socket: getSocket() };
}

/** Liefert die Menge der aktuell im Raum online verbundenen Nutzer-IDs. */
export function usePresence(): Set<string> {
  const [online, setOnline] = useState<Set<string>>(new Set());
  useSocketEvent<string[]>("presence:updated", (ids) => setOnline(new Set(ids)));
  return online;
}

/** Registriert einen Event-Listener für die Dauer des Renderns; Handler-Referenz darf sich ändern. */
export function useSocketEvent<T = unknown>(event: RealtimeEvent, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const socket = getSocket();
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [event]);
}
