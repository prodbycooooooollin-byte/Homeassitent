"use client";

import { useEffect, useState } from "react";

/**
 * Liefert die aktuelle Origin (z.B. "https://winrace.app") erst NACH der
 * Hydration. `window.location.origin` direkt während des Renderns zu lesen
 * würde einen Server/Client-Mismatch verursachen (SSR kennt kein `window`).
 * Fällt bis dahin auf NEXT_PUBLIC_SITE_URL zurück, das als Build-Time-
 * Konstante server- und clientseitig identisch ist.
 */
export function useOrigin(): string {
  const fallback = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const [origin, setOrigin] = useState(fallback);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return origin;
}
