import fs from "fs";
import path from "path";
import { dataDir } from "./store";
import type { RoleKey } from "./types";

/**
 * Vorwissen zur Rolle eines Helden. Quelle in dieser Reihenfolge:
 *  1. `description.role` aus den Spieldaten der Assets-API (Freitext, per Stichwort zugeordnet)
 *  2. kuratierte Liste klar unterstützender Helden (nur wenn die Spieldaten nichts liefern)
 * Das ist nur ein Vorwissen: Das tatsächliche Spielverhalten kann es überstimmen (siehe rating.ts).
 */
const CURATED_SUPPORT = new Set(["paige", "dynamo", "ivy", "kelvin"]);

export function roleFromText(text?: string | null): RoleKey | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/support|heal|buff|enabler|utility|protect/.test(t)) return "support";
  if (/tank|frontline|initiat|bruiser|brawl/.test(t)) return "tank";
  if (/carry|damage|dps|burst|assassin|marksman|ranged|sniper/.test(t)) return "carry";
  return null;
}

export type HeroRoleProvider = (heroId: number) => RoleKey | null;

interface CachedHero { name?: string; info?: { role?: string; type?: string } }
const g = globalThis as unknown as { __dlAssets?: { heroes: Record<number, CachedHero> }; __dlRoleCache?: Record<number, CachedHero> };

function heroes(): Record<number, CachedHero> {
  if (g.__dlAssets && Object.keys(g.__dlAssets.heroes).length) return g.__dlAssets.heroes;
  if (g.__dlRoleCache) return g.__dlRoleCache;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir(), "assets-cache.json"), "utf8")) as { heroes?: Record<number, CachedHero> };
    return (g.__dlRoleCache = raw.heroes ?? {});
  } catch {
    return {};
  }
}

/** Standard-Provider: liest die zwischengespeicherten Helden-Assets (synchron). */
export const cachedHeroRole: HeroRoleProvider = (heroId) => {
  const h = heroes()[heroId];
  if (!h) return null;
  const fromApi = roleFromText(h.info?.role);
  if (fromApi) return fromApi;
  return h.name && CURATED_SUPPORT.has(h.name.toLowerCase()) ? "support" : null;
};
