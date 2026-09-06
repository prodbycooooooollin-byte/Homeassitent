"use client";

import { useCallback, useEffect, useState } from "react";
import { getSocket } from "@/lib/socket-client";
import type { RoomStateView } from "@/lib/types";
import type { OverlayConfigInput } from "@/lib/validation";

interface OverlayData {
  state: RoomStateView;
  config: OverlayConfigInput;
}

/** Lädt Overlay-Daten und hält sie über Socket.io ohne manuelles Neuladen aktuell. */
export function useOverlayData(code: string, type: string, token: string | null) {
  const [data, setData] = useState<OverlayData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const res = await fetch(`/api/overlay/${code}/${type}${qs}`, { cache: "no-store" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Overlay konnte nicht geladen werden.");
      return;
    }
    setError(null);
    setData(await res.json());
  }, [code, type, token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data?.state.room.id) return;
    const socket = getSocket();
    const roomId = data.state.room.id;

    const join = () => socket.emit("join:room", roomId);
    if (socket.connected) join();
    socket.on("connect", join);

    const events = ["progress:updated", "challenge:updated", "games:updated", "teams:updated", "room:updated", "winner:pending", "winner:confirmed"];
    events.forEach((e) => socket.on(e, load));

    return () => {
      socket.emit("leave:room", roomId);
      socket.off("connect", join);
      events.forEach((e) => socket.off(e, load));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.state.room.id, load]);

  return { data, error };
}
