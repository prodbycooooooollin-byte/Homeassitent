"use client";

import { useMapEvents } from "react-leaflet";
import { latLngToWorld } from "@/components/map/coordinate-utils";
import type { MapMode } from "@/components/map/map-shell";

export function ClickHandler({
  mode,
  onPoint,
  onFreehandStart,
  onFreehandMove,
  onFreehandEnd,
  onCursorMove,
}: {
  mode: MapMode;
  onPoint: (p: { x: number; z: number }) => void;
  onFreehandStart: (p: { x: number; z: number }) => void;
  onFreehandMove: (p: { x: number; z: number }) => void;
  onFreehandEnd: () => void;
  onCursorMove: (p: { x: number; z: number }) => void;
}) {
  useMapEvents({
    click(e) {
      if (mode === "view" || mode === "draw-freehand") return;
      onPoint(latLngToWorld(e.latlng.lat, e.latlng.lng));
    },
    mousedown(e) {
      if (mode !== "draw-freehand") return;
      onFreehandStart(latLngToWorld(e.latlng.lat, e.latlng.lng));
    },
    mousemove(e) {
      onCursorMove(latLngToWorld(e.latlng.lat, e.latlng.lng));
      if (mode !== "draw-freehand") return;
      onFreehandMove(latLngToWorld(e.latlng.lat, e.latlng.lng));
    },
    mouseup() {
      if (mode !== "draw-freehand") return;
      onFreehandEnd();
    },
  });
  return null;
}
