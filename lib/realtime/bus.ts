import "server-only";
import { EventEmitter } from "node:events";

// Prozessweiter Event-Bus für Live-Updates auf der Weltkarte (Marker,
// Zeichnungen, Spielerpositionen). Für eine kleine, selbst gehostete
// Freundesgruppen-Instanz (ein Node-Prozess) ausreichend - siehe README für
// die Annahme "self-hosted Single-Process-Deployment".
const globalForBus = globalThis as unknown as { craftboardBus?: EventEmitter };

export const mapBus = globalForBus.craftboardBus ?? new EventEmitter();
mapBus.setMaxListeners(200);

if (process.env.NODE_ENV !== "production") {
  globalForBus.craftboardBus = mapBus;
}

export type MapEvent =
  | { kind: "marker.upsert" | "marker.delete"; dimension: string; markerId: string }
  | { kind: "drawing.upsert" | "drawing.delete"; dimension: string; drawingId: string }
  | { kind: "players.update" };

export function publishMapEvent(event: MapEvent) {
  mapBus.emit("event", event);
}
