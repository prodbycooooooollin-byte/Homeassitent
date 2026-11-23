import type { Id } from "./types";

/** Erzeugt eine stabile, kollisionsarme ID mit lesbarem Präfix. */
export function newId(prefix: string): Id {
  const c = globalThis.crypto;
  const raw =
    c && "randomUUID" in c
      ? c.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14).padEnd(12, "0");
  return `${prefix}_${raw}`;
}
