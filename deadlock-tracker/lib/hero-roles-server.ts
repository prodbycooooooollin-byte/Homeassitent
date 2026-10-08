import fs from "fs";
import path from "path";
import { dataDir } from "./store";
import { heroRole, type HeroRoleProvider } from "./hero-roles";

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
  return heroRole(h.name, h.info?.type, h.info?.role);
};
