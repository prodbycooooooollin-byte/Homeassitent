import { fetchHeroes, type HeroInfo } from "./api";

const g = globalThis as unknown as { __dlHeroes?: { at: number; map: Record<number, HeroInfo> } };
const TTL = 6 * 3600 * 1000;

export async function getHeroes(): Promise<Record<number, HeroInfo>> {
  if (g.__dlHeroes && Date.now() - g.__dlHeroes.at < TTL) return g.__dlHeroes.map;
  const list = await fetchHeroes();
  if (!list.length && g.__dlHeroes) return g.__dlHeroes.map; // alten Cache behalten
  const map: Record<number, HeroInfo> = {};
  for (const h of list) map[h.id] = h;
  // Bei Fehlschlag kurz cachen (1 Min), um die API nicht zu hämmern
  g.__dlHeroes = { at: list.length ? Date.now() : Date.now() - TTL + 60_000, map };
  return map;
}
