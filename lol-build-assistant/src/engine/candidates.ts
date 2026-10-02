import type { ChampionProfile, ItemDef, PlaystyleDef } from '../shared/types';

export interface CostResolution {
  remaining: number;
  /** Aus dem Inventar verbrauchte Komponenten (IDs, ggf. mehrfach). */
  consumed: number[];
}

/**
 * Restkosten eines Items unter Nutzung vorhandener Komponenten (Rezeptgraph).
 * `pool` wird nicht verändert.
 */
export function resolveCost(itemId: number, owned: number[], items: Map<number, ItemDef>): CostResolution {
  const pool = [...owned];
  const consumed: number[] = [];
  const walk = (id: number, isRoot: boolean): number => {
    if (!isRoot) {
      const idx = pool.indexOf(id);
      if (idx >= 0) { pool.splice(idx, 1); consumed.push(id); return 0; }
    }
    const it = items.get(id);
    if (!it) return Infinity;
    const compCost = it.recipe.reduce((s, c) => s + (items.get(c)?.cost ?? 0), 0);
    let cost = it.cost - compCost;
    for (const c of it.recipe) cost += walk(c, false);
    return cost;
  };
  const remaining = walk(itemId, true);
  return { remaining, consumed };
}

export interface Candidate {
  item: ItemDef;
  remaining: number;
  consumed: number[];
  slotsAfter: number;
}

export interface Exclusion {
  itemId: number;
  reason: string;
}

export interface CandidateSet {
  candidates: Candidate[];
  exclusions: Exclusion[];
}

export function isBoots(it: ItemDef): boolean {
  return it.tier === 'boots' || it.tier === 'boots-basic';
}

/** Besitzt das Inventar bereits ein Item der Gruppe (außer den durch das Rezept verbrauchten)? */
function groupConflict(it: ItemDef, owned: number[], consumed: number[], items: Map<number, ItemDef>): string | null {
  if (!it.groups?.length) return null;
  const rest = [...owned];
  for (const c of consumed) { const i = rest.indexOf(c); if (i >= 0) rest.splice(i, 1); }
  for (const id of rest) {
    const o = items.get(id);
    const shared = o?.groups?.find((g) => it.groups!.includes(g));
    if (o && shared) return `Kaufbeschränkung: nur ein Item der Gruppe '${shared}' (bereits: ${o.nameDe ?? o.name})`;
  }
  return null;
}

/**
 * Championverträgliche, kaufbare Kandidaten + begründete Ausschlüsse.
 * Das Profil liefert nur die plausible Kandidatenmenge (keine Reihenfolge).
 */
export function generateCandidates(
  owned: number[],
  profile: ChampionProfile,
  playstyle: PlaystyleDef,
  items: Map<number, ItemDef>,
  opts: { mapNumber: number; slots: number; forceInclude?: number[] },
): CandidateSet {
  const candidates: Candidate[] = [];
  const exclusions: Exclusion[] = [];
  const ownedSet = new Set(owned);
  const ownsTier2Boots = owned.some((id) => items.get(id)?.tier === 'boots');
  for (const it of items.values()) {
    if (it.tier !== 'legendary' && it.tier !== 'boots') continue;
    const forced = opts.forceInclude?.includes(it.id) ?? false;
    const inPool = it.tags.some((t) => playstyle.itemTags.includes(t)) || playstyle.extraCandidates.includes(it.id);
    if (!inPool && !forced) continue;
    const exclude = (reason: string) => exclusions.push({ itemId: it.id, reason });
    if (playstyle.excluded.includes(it.id) && !forced) { exclude(`Passt nicht zur Spielweise '${playstyle.name}' (Profil)`); continue; }
    if (it.maps && !it.maps.includes(opts.mapNumber)) { exclude('Auf dieser Karte nicht kaufbar'); continue; }
    if (ownedSet.has(it.id)) { exclude('Bereits im Inventar'); continue; }
    if (it.meleeOnly && profile.ranged) { exclude('Nur für Nahkämpfer'); continue; }
    if (it.rangedOnly && !profile.ranged) { exclude('Nur für Fernkämpfer'); continue; }
    if (it.tags.includes('mana') && profile.resource !== 'mana') { exclude('Manawert ohne Nutzen (keine Mana-Ressource)'); continue; }
    if (it.tier === 'boots' && ownsTier2Boots) { exclude('Es sind bereits Stiefel gekauft'); continue; }
    const cost = resolveCost(it.id, owned, items);
    const conflict = groupConflict(it, owned, cost.consumed, items);
    if (conflict) { exclude(conflict); continue; }
    const slotsAfter = owned.length - cost.consumed.length + 1;
    candidates.push({ item: it, remaining: cost.remaining, consumed: cost.consumed, slotsAfter });
  }
  return { candidates, exclusions };
}

/** Knoten des Rezeptbaums, die noch fehlen, mit ihren Restkosten. */
export interface MissingNode {
  itemId: number;
  remaining: number;
  depth: number;
  parent: number | null;
}

export function missingComponents(targetId: number, owned: number[], items: Map<number, ItemDef>): MissingNode[] {
  const pool = [...owned];
  const out: MissingNode[] = [];
  const walk = (id: number, depth: number, parent: number | null) => {
    const it = items.get(id);
    if (!it) return;
    for (const c of it.recipe) {
      const idx = pool.indexOf(c);
      if (idx >= 0) { pool.splice(idx, 1); continue; }
      const res = resolveCost(c, pool, items);
      out.push({ itemId: c, remaining: res.remaining, depth, parent: id === targetId ? null : id });
      walk(c, depth + 1, c);
    }
  };
  walk(targetId, 0, null);
  return out;
}
