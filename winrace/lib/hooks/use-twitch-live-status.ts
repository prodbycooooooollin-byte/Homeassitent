"use client";

import { useEffect, useRef, useState } from "react";

export interface TwitchStreamStatus {
  login: string;
  isLive: boolean;
  title?: string;
  gameName?: string;
  viewerCount?: number;
  thumbnailUrl?: string;
}

/** Pollt den Live-Status mehrerer Twitch-Kanäle (Helix, serverseitig gecacht). */
export function useTwitchLiveStatus(logins: string[]) {
  const [statusByLogin, setStatusByLogin] = useState<Record<string, TwitchStreamStatus>>({});
  const [configured, setConfigured] = useState(true);
  const key = logins.slice().sort().join(",");
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    async function load() {
      const res = await fetch(`/api/twitch/streams?logins=${encodeURIComponent(keyRef.current)}`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      setStatusByLogin(data.streams ?? {});
      setConfigured(Boolean(data.configured));
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [key]);

  return { statusByLogin, configured };
}
