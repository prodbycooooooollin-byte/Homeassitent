"use client";

import { useEffect, useRef } from "react";

export interface StreamEvent {
  kind: string;
  dimension?: string;
  markerId?: string;
  drawingId?: string;
}

/**
 * Verbindet sich per SSE mit /api/map/stream und ruft `onEvent` für jedes
 * empfangene Ereignis auf. Verbindet bei Verbindungsabbruch automatisch neu
 * (einfacher Backoff) - so bleiben andere Nutzer live synchron, auch nach
 * kurzen Netzwerkaussetzern.
 */
export function useMapEventsStream(onEvent: (event: StreamEvent) => void) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let stopped = false;

    function connect() {
      source = new EventSource("/api/map/stream");
      source.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data) as StreamEvent;
          if (data.kind !== "ping" && data.kind !== "connected") {
            callbackRef.current(data);
          }
        } catch {
          // ignorieren
        }
      };
      source.onerror = () => {
        source?.close();
        if (!stopped) retryTimeout = setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimeout);
      source?.close();
    };
  }, []);
}
