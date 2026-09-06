"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRoomRealtime, useSocketEvent, usePresence, type ConnectionStatus } from "@/lib/hooks/use-room-realtime";
import type { RoomStateView } from "@/lib/types";

interface RoomStateContextValue {
  state: RoomStateView;
  code: string;
  currentUserId: string | null;
  connectionStatus: ConnectionStatus;
  online: Set<string>;
  refetch: () => Promise<void>;
  /** Optimistisches lokales Patch, bis der nächste Refetch/Realtime-Event den echten Stand bringt. */
  patch: (updater: (prev: RoomStateView) => RoomStateView) => void;
}

const RoomStateContext = createContext<RoomStateContextValue | null>(null);

export function RoomStateProvider({
  code,
  currentUserId,
  initialState,
  children,
}: {
  code: string;
  currentUserId: string | null;
  initialState: RoomStateView;
  children: ReactNode;
}) {
  const [state, setState] = useState(initialState);
  const inFlight = useRef(false);

  const refetch = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/rooms/${code}/state`, { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } finally {
      inFlight.current = false;
    }
  }, [code]);

  const { status } = useRoomRealtime(state.room.id, { userId: currentUserId, onReconnect: refetch });
  const online = usePresence();

  useSocketEvent("members:updated", refetch);
  useSocketEvent("room:updated", refetch);
  useSocketEvent("teams:updated", refetch);
  useSocketEvent("challenge:updated", refetch);
  useSocketEvent("games:updated", refetch);
  useSocketEvent("progress:updated", refetch);
  useSocketEvent("winner:pending", refetch);
  useSocketEvent("winner:confirmed", refetch);

  // Sanftes Polling als Netz für den unwahrscheinlichen Fall verpasster
  // Socket-Events (z.B. Reverse-Proxy killt idle WS nach x Minuten).
  useEffect(() => {
    const interval = setInterval(refetch, 45_000);
    return () => clearInterval(interval);
  }, [refetch]);

  const patch = useCallback((updater: (prev: RoomStateView) => RoomStateView) => {
    setState((prev) => updater(prev));
  }, []);

  return (
    <RoomStateContext.Provider value={{ state, code, currentUserId, connectionStatus: status, online, refetch, patch }}>
      {children}
    </RoomStateContext.Provider>
  );
}

export function useRoomState() {
  const ctx = useContext(RoomStateContext);
  if (!ctx) throw new Error("useRoomState muss innerhalb von <RoomStateProvider> verwendet werden.");
  return ctx;
}
