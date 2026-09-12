"use client";

import type { MarkerView, DrawingView, LivePlayerPosition } from "@/lib/queries/map";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Fehler (${res.status})`);
  return body as T;
}

export const mapApi = {
  listMarkers: (dimension: string) =>
    jsonFetch<{ markers: MarkerView[] }>(`/api/map/markers?dimension=${dimension}`).then((r) => r.markers),
  createMarker: (data: object) =>
    jsonFetch<{ marker: MarkerView }>("/api/map/markers", { method: "POST", body: JSON.stringify(data) }),
  updateMarker: (id: string, data: object) =>
    jsonFetch(`/api/map/markers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteMarker: (id: string) => jsonFetch(`/api/map/markers/${id}`, { method: "DELETE" }),

  listDrawings: (dimension: string) =>
    jsonFetch<{ drawings: DrawingView[] }>(`/api/map/drawings?dimension=${dimension}`).then((r) => r.drawings),
  createDrawing: (data: object) =>
    jsonFetch<{ drawing: DrawingView }>("/api/map/drawings", { method: "POST", body: JSON.stringify(data) }),
  updateDrawing: (id: string, data: object) =>
    jsonFetch(`/api/map/drawings/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteDrawing: (id: string) => jsonFetch(`/api/map/drawings/${id}`, { method: "DELETE" }),

  listPlayers: () => jsonFetch<{ players: LivePlayerPosition[] }>("/api/map/players").then((r) => r.players),
};
