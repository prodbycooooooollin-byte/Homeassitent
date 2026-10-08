import type { RoleKey } from "./types";

/**
 * Vorwissen zur Rolle eines Helden. Quelle in dieser Reihenfolge:
 *  1. `description.role` aus den Spieldaten der Assets-API (Freitext, per Stichwort zugeordnet)
 *  2. kuratierte Liste klar unterstützender Helden (nur wenn die Spieldaten nichts liefern)
 * Das ist nur ein Vorwissen: Das tatsächliche Spielverhalten kann es überstimmen (siehe rating.ts).
 */
export const CURATED = new Set(["paige", "dynamo", "ivy", "kelvin"]);

export function roleFromText(text?: string | null): RoleKey | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/support|heal|buff|enabler|utility|protect/.test(t)) return "support";
  if (/tank|frontline|initiat|bruiser|brawl/.test(t)) return "tank";
  if (/carry|damage|dps|burst|assassin|marksman|ranged|sniper/.test(t)) return "carry";
  return null;
}

export type HeroRoleProvider = (heroId: number) => RoleKey | null;


