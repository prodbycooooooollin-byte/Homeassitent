"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

/** Deaktiviert das Kartenziehen im Freihand-Zeichenmodus, damit Mausklick
 * und -bewegung ausschließlich das Zeichnen steuern. */
export function MapDragToggle({ disabled }: { disabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (disabled) map.dragging.disable();
    else map.dragging.enable();
  }, [disabled, map]);
  return null;
}
