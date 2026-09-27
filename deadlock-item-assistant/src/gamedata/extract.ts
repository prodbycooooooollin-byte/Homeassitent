import type { Activation, GameDataSet, HeroAbilityDef, HeroDef, ItemDef, ItemSlot } from '../shared/gamedata';
import { type KV3Object, type KV3Value, parseKV1Tokens, parseKV3 } from './kv3';
import { itemIdFromClassName } from './hash';

// Extrahiert Items und Heroes aus den Rohdateien des Spiels. Wird vom
// Kommandozeilenskript (scripts/extract-gamedata.ts) und von der App
// ("Spieldaten aktualisieren") verwendet.

export interface RawGameFiles {
  abilities: string;       // scripts/abilities.vdata
  heroes: string;          // scripts/heroes.vdata
  genericData: string;     // scripts/generic_data.vdata
  steamInf: string;        // game/citadel/steam.inf
  modNames: string;        // localization citadel_gc_mod_names_english
  mods: string;            // localization citadel_mods_english
  heroNames: string;       // localization citadel_gc_hero_names_english
  heroesLoc: string;       // localization citadel_heroes_english
}

const SLOT: Record<string, ItemSlot> = {
  EItemSlotType_WeaponMod: 'weapon',
  EItemSlotType_Armor: 'vitality',
  EItemSlotType_Tech: 'spirit',
};

// Eigenschaften, die in jedem Item als Platzhalter stehen und nichts über den Effekt aussagen.
const NOISE_PROPS = /^(AbilityCastRange|AbilityUnitTargetLimit|AbilityCastDelay|AbilityChannelTime|AbilityPostCastDuration|AbilityCharges|AbilityCooldownBetweenCharge|ChannelMoveSpeed|AbilityResourceCost|TickRate|ThinkRate|ParticleRadius|VisualContractRadius|SkipFrames|DampingFactor|ModelScaleGrowthTooltip)$/;

function isObj(v: KV3Value | undefined): v is KV3Object {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(a: KV3Value, b: KV3Value): KV3Value {
  if (!isObj(a) || !isObj(b)) return b;
  const o: KV3Object = { ...a };
  for (const k of Object.keys(b)) o[k] = k in a ? deepMerge(a[k], b[k]) : b[k];
  return o;
}

/** Löst _base/_multibase-Vererbung der vdata-Einträge auf. */
function makeResolver(root: KV3Object) {
  const cache = new Map<string, KV3Object>();
  const resolve = (key: string, stack: string[] = []): KV3Object => {
    const hit = cache.get(key);
    if (hit) return hit;
    const own = root[key];
    if (!isObj(own)) return {};
    const bases = Array.isArray(own._multibase) ? (own._multibase as string[]) : typeof own._base === 'string' ? [own._base] : [];
    let merged: KV3Value = {};
    for (const b of bases) if (!stack.includes(b)) merged = deepMerge(merged, resolve(b, [...stack, key]));
    const out = deepMerge(merged, own) as KV3Object;
    cache.set(key, out);
    return out;
  };
  return resolve;
}

/** Wandelt m_strValue in eine Zahl um ("2.0m" → 2, "-35" → -35). Nicht-numerische Werte → null. */
export function numericValue(v: KV3Value | undefined): number | null {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return null;
  const m = /^\s*([-+]?\d*\.?\d+)/.exec(v);
  return m ? Number(m[1]) : null;
}

function propsOf(entry: KV3Object): Record<string, number> {
  const out: Record<string, number> = {};
  const map = entry.m_mapAbilityProperties;
  if (!isObj(map)) return out;
  for (const [k, v] of Object.entries(map)) {
    if (NOISE_PROPS.test(k) || !isObj(v)) continue;
    const n = numericValue(v.m_strValue);
    if (n === null || n === 0 || n === -1) continue;
    out[k] = n;
  }
  return out;
}

export function cleanLocText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\{g:citadel_inline_attribute:'(\w+)'\}/g, (_m, a: string) => a.replace(/([a-z])([A-Z])/g, '$1 $2'))
    .replace(/\{g:citadel_binding:'(\w+)'\}/g, '[$1]')
    .replace(/\s+/g, ' ')
    .trim();
}

function descriptionFor(loc: Record<string, string>, className: string): string {
  const keys = Object.keys(loc).filter((k) =>
    (k.startsWith(`${className}_`) || k.startsWith(`upgrade_${className}_`)) && /desc/.test(k) && !/_search|_mod_|_label/.test(k));
  // exakter Schlüssel zuerst, dann aktive/passive Varianten
  keys.sort((a, b) => a.length - b.length);
  return [...new Set(keys.map((k) => cleanLocText(loc[k])))].join(' / ');
}

function activationOf(a: KV3Value | undefined): Activation {
  const s = String(a ?? '');
  if (/TOGGLE/.test(s)) return 'toggle';
  if (/PASSIVE/.test(s) || s === '') return 'passive';
  return 'active';
}

export function parseSteamInf(text: string): { build: number; versionDate: string } {
  const get = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(text)?.[1]?.trim() ?? '';
  return { build: Number(get('ClientVersion')) || 0, versionDate: `${get('VersionDate')} ${get('VersionTime')}`.trim() };
}

export function extractGameData(raw: RawGameFiles, source: string): GameDataSet {
  const abilities = parseKV3(raw.abilities);
  const heroesKv = parseKV3(raw.heroes);
  const generic = parseKV3(raw.genericData);
  const inf = parseSteamInf(raw.steamInf);
  const modNames = parseKV1Tokens(raw.modNames);
  const modsLoc = parseKV1Tokens(raw.mods);
  const heroNames = parseKV1Tokens(raw.heroNames);
  const heroesLoc = parseKV1Tokens(raw.heroesLoc);

  const prices = (Array.isArray(generic.m_nItemPricePerTier) ? generic.m_nItemPricePerTier : []).map(Number);
  if (prices.length < 5) throw new Error('m_nItemPricePerTier fehlt in generic_data.vdata');

  const resolve = makeResolver(abilities);
  const items: ItemDef[] = [];
  for (const key of Object.keys(abilities)) {
    if (!isObj(abilities[key])) continue;
    const e = resolve(key);
    if (e.m_eAbilityType !== 'EAbilityType_Item') continue;
    const slot = SLOT[String(e.m_eItemSlotType)];
    const tierMatch = /EModTier_(\d)/.exec(String(e.m_iItemTier ?? ''));
    const tier = tierMatch ? Number(tierMatch[1]) : 0;
    // Nur kaufbare Shop-Items: gültige Spalte, Stufe 1–4, nicht deaktiviert, mit Shop-Icon.
    if (!slot || tier < 1 || tier > 4 || e.m_bDisabled === true || !e.m_strShopIconLarge) continue;
    const nameEn = modNames[key];
    if (!nameEn) continue;
    const components = Array.isArray(e.m_vecComponentItems) ? (e.m_vecComponentItems as string[]) : [];
    items.push({
      className: key,
      nameEn: nameEn.trim(),
      slot,
      tier: tier as 1 | 2 | 3 | 4,
      cost: prices[tier],
      components,
      activation: activationOf(e.m_eAbilityActivation),
      props: propsOf(e),
      description: descriptionFor(modsLoc, key),
      shopFilters: String(e.m_eShopFilters ?? '').split('|').map((s) => s.trim()).filter(Boolean),
      id: itemIdFromClassName(key),
      idSource: 'computed-murmur2',
    });
  }
  items.sort((a, b) => a.slot.localeCompare(b.slot) || a.tier - b.tier || a.nameEn.localeCompare(b.nameEn));

  const heroes: HeroDef[] = [];
  for (const key of Object.keys(heroesKv)) {
    const h = heroesKv[key];
    if (!key.startsWith('hero_') || !isObj(h)) continue;
    if (h.m_bPlayerSelectable !== true || h.m_bDisabled === true || h.m_bInDevelopment === true || h.m_bPrereleaseOnly === true) continue;
    const bound = isObj(h.m_mapBoundAbilities) ? h.m_mapBoundAbilities : {};
    const abilitiesOut: HeroAbilityDef[] = [];
    for (const [slotKey, abilityName] of Object.entries(bound)) {
      if (!/^ESlot_Signature_/.test(slotKey) || typeof abilityName !== 'string') continue;
      const a = resolve(abilityName);
      abilitiesOut.push({ className: abilityName, slot: slotKey.replace('ESlot_', ''), props: propsOf(a), description: cleanLocText(heroesLoc[`${abilityName}_desc`] ?? '') });
    }
    const stats: Record<string, number> = {};
    if (isObj(h.m_mapStartingStats)) for (const [k, v] of Object.entries(h.m_mapStartingStats)) if (typeof v === 'number') stats[k] = v;
    heroes.push({
      className: key,
      heroId: Number(h.m_HeroID),
      nameEn: heroNames[`${key}:n`] ?? heroNames[key] ?? key,
      role: cleanLocText(heroesLoc[`${key}_role`] ?? ''),
      abilities: abilitiesOut,
      startingStats: stats,
    });
  }
  heroes.sort((a, b) => a.heroId - b.heroId);

  return {
    manifest: {
      build: inf.build,
      versionDate: inf.versionDate,
      source,
      sourceFiles: ['scripts/abilities.vdata', 'scripts/heroes.vdata', 'scripts/generic_data.vdata', 'steam.inf',
        'localization/citadel_gc_mod_names_english', 'localization/citadel_mods_english', 'localization/citadel_gc_hero_names_english', 'localization/citadel_heroes_english'],
      extractedAt: new Date().toISOString(),
      itemPricePerTier: prices,
      itemCount: items.length,
      heroCount: heroes.length,
    },
    items,
    heroes,
  };
}
