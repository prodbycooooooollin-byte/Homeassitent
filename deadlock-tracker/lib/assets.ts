import fs from "fs";
import path from "path";
import { dataDir } from "./store";
import { DEMO_HEROES, DEMO_ITEMS } from "./fixtures";
import { isDemo } from "./api";

/** Normalisierte Asset-Daten (Helden + Ränge) für den Client. Bild-URLs laufen über /api/img (Cache + Allowlist). */
export interface HeroAsset {
  id: number;
  name: string;
  color: string; // #rrggbb
  /** false bei deaktivierten/unveröffentlichten Helden (Test-/Entwicklungs-Einträge der Asset-API) */
  playable?: boolean;
  portrait?: string; // Karte/Hochformat
  small?: string; // Icon
  art?: string; // breite Illustration / Hintergrund
  figure?: string; // freigestellte Heldenfigur (Auswahlbild)
  wordmark?: string; // Namenszug als Grafik
  /** interner Name aus den Spieldaten (z. B. "inferno" für Infernus) – wird zum Finden des 3D-Modells genutzt */
  codeName?: string;
  /** Fakten aus den Spieldaten */
  info?: HeroInfoAsset;
}
export interface HeroInfoAsset {
  /** assassin | brawler | marksman | mystic */
  type?: string;
  role?: string;
  playstyle?: string;
  lore?: string;
  complexity?: number;
  tags: string[];
  /** Ausgewählte Startwerte */
  stats: { key: string; label: string; value: number }[];
  /** Klassennamen der Fähigkeiten (zum Auflösen über die Item-Assets) */
  abilityClasses: string[];
}
export interface RankAsset {
  tier: number;
  name: string;
  color?: string;
  small?: string;
  large?: string;
  sub: Record<number, { small?: string; large?: string; badge?: string }>;
}
export interface AssetBundle {
  heroes: Record<number, HeroAsset>;
  ranks: Record<number, RankAsset>;
  fetchedAt: number;
  source: "live" | "cache" | "demo" | "none";
}

const API = () => (process.env.DEADLOCK_API_URL || "https://api.deadlock-api.com").replace(/\/$/, "");
/** Alter Host (v2) nur noch als Fallback – die Assets liegen inzwischen unter /v1/assets der Haupt-API. */
const LEGACY = () => (process.env.DEADLOCK_ASSETS_URL || "https://assets.deadlock-api.com").replace(/\/$/, "");
const TTL = 12 * 3600 * 1000;
const g = globalThis as unknown as { __dlAssets?: AssetBundle };

import { imgUrl } from "./img";
import { logCall } from "./diag";

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const firstStr = (o: Obj, keys: string[]) => keys.map((k) => str(o[k])).find(Boolean);

export function hashColor(seed: number): string {
  const h = (seed * 47) % 360;
  const [r, g2, b] = hslToRgb(h / 360, 0.55, 0.55);
  return "#" + [r, g2, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}
function toHex(v: unknown): string | undefined {
  if (Array.isArray(v) && v.length >= 3 && v.every((x) => typeof x === "number")) {
    return "#" + (v as number[]).slice(0, 3).map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
  }
  if (typeof v === "string" && /^#?[0-9a-f]{6}$/i.test(v)) return v.startsWith("#") ? v : `#${v}`;
  return undefined;
}

const STAT_LABELS: Record<string, string> = { max_health: "Leben", max_move_speed: "Lauftempo", sprint_speed: "Sprinttempo", weapon_power: "Waffenkraft", stamina: "Ausdauer", light_melee_damage: "Nahkampf", reload_speed: "Nachladen", base_health_regen: "Regeneration" };
function heroInfo(h: Obj): HeroInfoAsset {
  const d = (typeof h.description === "object" && h.description ? h.description : {}) as Obj;
  const st = (typeof h.starting_stats === "object" && h.starting_stats ? h.starting_stats : {}) as Record<string, Obj | null>;
  const stats = Object.keys(STAT_LABELS).flatMap((k) => (st[k] && typeof st[k]!.value === "number" ? [{ key: k, label: STAT_LABELS[k], value: st[k]!.value as number }] : []));
  const items = (typeof h.items === "object" && h.items ? h.items : {}) as Record<string, unknown>;
  return {
    type: str(h.hero_type), role: str(d.role), playstyle: str(d.playstyle), lore: str(d.lore),
    complexity: typeof h.complexity === "number" ? h.complexity : undefined,
    tags: Array.isArray(h.tags) ? (h.tags as unknown[]).filter((t): t is string => typeof t === "string") : [],
    stats,
    abilityClasses: Object.entries(items).filter(([k, v]) => /ability/i.test(k) && typeof v === "string").map(([, v]) => v as string),
  };
}

export function normalizeHeroes(raw: unknown): Record<number, HeroAsset> {
  const out: Record<number, HeroAsset> = {};
  if (!Array.isArray(raw)) return out;
  for (const h of raw as Obj[]) {
    const id = Number(h.id);
    const name = str(h.name);
    if (!id || !name) continue;
    const im = (typeof h.images === "object" && h.images ? h.images : {}) as Obj;
    const colors = (typeof h.colors === "object" && h.colors ? h.colors : {}) as Obj;
    out[id] = {
      id,
      name,
      playable: !(h.disabled === true || h.in_development === true || h.player_selectable === false),
      color: toHex(colors.style_hex) ?? toHex(colors.ui) ?? toHex(colors.highlight) ?? hashColor(id),
      portrait: imgUrl(firstStr(im, ["icon_hero_card", "top_bar_vertical_image", "hero_card_gloat", "icon_image_small", "icon_hero_card_webp"])),
      small: imgUrl(firstStr(im, ["icon_image_small", "minimap_image", "icon_hero_card", "icon_image_small_webp"])),
      art: imgUrl(firstStr(im, ["background_image", "hero_card_gloat", "hero_card_critical", "icon_hero_card", "background_image_webp"])),
      figure: imgUrl(firstStr(im, ["selection_image", "hero_card_gloat", "selection_image_webp"])),
      wordmark: imgUrl(firstStr(im, ["name_image"])),
      codeName: str(h.class_name)?.replace(/^hero_/, ""),
      info: heroInfo(h),
    };
  }
  return out;
}

export function normalizeRanks(raw: unknown): Record<number, RankAsset> {
  const out: Record<number, RankAsset> = {};
  if (!Array.isArray(raw)) return out;
  for (const r of raw as Obj[]) {
    const tier = Number(r.tier);
    if (!Number.isFinite(tier)) continue;
    const im = (typeof r.images === "object" && r.images ? r.images : {}) as Obj;
    const sub: RankAsset["sub"] = {};
    for (let n = 1; n <= 6; n++) {
      sub[n] = {
        small: imgUrl(firstStr(im, [`small_subrank${n}`])),
        large: imgUrl(firstStr(im, [`large_subrank${n}`])),
        badge: imgUrl(firstStr(im, [`subrank${n}`])), // Tier-Badge mit eingezeichneter Division
      };
    }
    out[tier] = {
      tier,
      name: str(r.name) ?? `Tier ${tier}`,
      color: toHex(r.color),
      small: imgUrl(firstStr(im, ["small", "small_webp"])),
      large: imgUrl(firstStr(im, ["large", "large_webp"])),
      sub,
    };
  }
  return out;
}

const cacheFile = () => path.join(dataDir(), "assets-cache.json");

async function getJson(url: string): Promise<unknown> {
  const t0 = Date.now();
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    logCall({ at: t0, path, status: res.status, ms: Date.now() - t0 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (!(e instanceof Error && e.message.startsWith("HTTP"))) logCall({ at: t0, path, status: "ERR", ms: Date.now() - t0, note: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

export async function getAssets(): Promise<AssetBundle> {
  if (isDemo()) {
    const heroes: Record<number, HeroAsset> = {};
    for (const h of DEMO_HEROES) heroes[h.id] = { id: h.id, name: h.name, color: hashColor(h.id) };
    return { heroes, ranks: {}, fetchedAt: Date.now(), source: "demo" };
  }
  if (g.__dlAssets && Date.now() - g.__dlAssets.fetchedAt < (g.__dlAssets.source === "live" ? TTL : 60_000)) return g.__dlAssets;
  try {
    const load = async (path: string) => {
      try {
        return await getJson(`${API()}/v1/assets/${path}`);
      } catch {
        return getJson(`${LEGACY()}/v2/${path}`);
      }
    };
    const [h, r] = await Promise.all([load("heroes"), load("ranks").catch(() => [])]);
    const bundle: AssetBundle = { heroes: normalizeHeroes(h), ranks: normalizeRanks(r), fetchedAt: Date.now(), source: "live" };
    if (!Object.keys(bundle.heroes).length) throw new Error("keine Helden");
    try {
      fs.mkdirSync(dataDir(), { recursive: true });
      fs.writeFileSync(cacheFile(), JSON.stringify(bundle));
    } catch {}
    return (g.__dlAssets = bundle);
  } catch {
    // Offline/API down: letzten erfolgreichen Stand von der Platte verwenden.
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile(), "utf8")) as AssetBundle;
      return (g.__dlAssets = { ...cached, fetchedAt: Date.now(), source: "cache" });
    } catch {
      return (g.__dlAssets = { heroes: {}, ranks: {}, fetchedAt: Date.now(), source: "none" });
    }
  }
}

/* ---- Items (nur kaufbare Upgrades; große Antwort, daher getrennt und lange zwischengespeichert) ---- */
export interface ItemAsset {
  id: number; name: string;
  /** Kleines Shop-Bild (Fallback: normales Item-Bild) */
  image?: string;
  /** Größeres Shop-Bild für große Darstellungen */
  imageLarge?: string;
  tier: number; slot: string; cost?: number; cls?: string; type?: string;
  /** Kurzbeschreibung als Klartext */
  desc?: string;
}

/** Beschreibung (String oder Objekt mit desc/active/passive) als kurzen Klartext ohne HTML/Platzhalter. */
export function plainDesc(v: unknown): string | undefined {
  const parts: string[] = [];
  const walk = (x: unknown, depth: number) => {
    if (typeof x === "string") parts.push(x);
    else if (x && typeof x === "object" && depth < 2) for (const k of ["desc", "active", "passive"]) walk((x as Obj)[k], depth + 1);
  };
  walk(v, 0);
  const t = parts.join(" ").replace(/<[^>]*>/g, " ").replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > 220 ? `${t.slice(0, 217).trimEnd()} …` : t;
}

/** Bevorzugt die echten Shop-Bilder; fällt sonst auf das normale Item-Bild zurück. */
export function itemImages(it: Obj): { image?: string; imageLarge?: string } {
  const small = firstStr(it, ["shop_image_small_webp", "shop_image_small", "shop_image_webp", "shop_image", "image_webp", "image"]);
  const large = firstStr(it, ["shop_image_webp", "shop_image", "shop_image_small_webp", "shop_image_small", "image_webp", "image"]);
  return { image: imgUrl(small), imageLarge: imgUrl(large) };
}
const gi = globalThis as unknown as { __dlItems?: { at: number; map: Record<number, ItemAsset> } };
const itemsFile = () => path.join(dataDir(), "items-cache-v2.json");

export async function getItems(): Promise<Record<number, ItemAsset>> {
  if (isDemo()) {
    const map: Record<number, ItemAsset> = {};
    DEMO_ITEMS.forEach((name, i) => { map[1000 + i] = { id: 1000 + i, name, tier: 1 + (i % 4), slot: ["weapon", "vitality", "spirit"][i % 3], cost: 500 * (1 + (i % 4)), desc: "Demo-Item: Beschreibung steht im Live-Modus zur Verfügung." }; });
    return map;
  }
  if (gi.__dlItems && Date.now() - gi.__dlItems.at < 24 * 3600_000) return gi.__dlItems.map;
  try {
    const raw = await getJson(`${API()}/v1/assets/items`);
    const map: Record<number, ItemAsset> = {};
    for (const it of Array.isArray(raw) ? (raw as Obj[]) : []) {
      const id = Number(it.id);
      if (!id || !str(it.name) || (it.type !== "upgrade" && it.type !== "ability")) continue;
      map[id] = {
        id, name: String(it.name), tier: Number(it.item_tier) || 1, slot: str(it.item_slot_type) ?? "weapon", cls: str(it.class_name), type: String(it.type),
        cost: typeof it.cost === "number" ? it.cost : undefined,
        ...itemImages(it),
        desc: plainDesc(it.description),
      };
    }
    if (!Object.keys(map).length) throw new Error("keine Items");
    gi.__dlItems = { at: Date.now(), map };
    try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(itemsFile(), JSON.stringify(map)); } catch {}
    return map;
  } catch {
    try {
      const map = JSON.parse(fs.readFileSync(itemsFile(), "utf8")) as Record<number, ItemAsset>;
      gi.__dlItems = { at: Date.now() - 23 * 3600_000, map }; // bald erneut versuchen
      return map;
    } catch {
      return {};
    }
  }
}
