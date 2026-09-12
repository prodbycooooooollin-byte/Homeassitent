import { getCurrentUser } from "@/lib/auth/session";
import { mapBus, type MapEvent } from "@/lib/realtime/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent-Events-Stream für Live-Updates der Weltkarte. Erfordert eine
 * angemeldete Sitzung (gleiche Session-Cookie-Prüfung wie überall sonst).
 * Der Client verbindet sich per EventSource und aktualisiert bei einem
 * Ereignis die betroffenen Daten (siehe components/map/use-map-events.ts) -
 * ohne Seiten-Reload.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Nicht angemeldet.", { status: 401 });
  }

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval>;
  let listener: (event: MapEvent) => void;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller bereits geschlossen (Client hat getrennt).
        }
      };

      send({ kind: "connected" });
      listener = (event) => send(event);
      mapBus.on("event", listener);

      // Hält Proxies/Load-Balancer davon ab, die Verbindung wegen
      // Inaktivität zu kappen.
      heartbeat = setInterval(() => send({ kind: "ping" }), 25_000);
    },
    cancel() {
      clearInterval(heartbeat);
      mapBus.off("event", listener);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
