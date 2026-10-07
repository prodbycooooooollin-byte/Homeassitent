import fs from "fs";
import path from "path";
import { dataDir } from "./store";
import { DEMO_HEROES } from "./fixtures";
import { isDemo } from "./api";

/** Normalisierte Asset-Daten (Helden + Ränge) für den Client. Bild-URLs laufen über /api/img (Cache + Allowlist). */
export interface HeroAsset {
  id: number;
  name: string;
  color: string; // #rrggbb
  portrait?: string; // Karte/Hochformat
  small?: string; // Icon
  art?: string; // breite Illustration / Hintergrund
}
export interface RankAsset {
  tier: number;
  name: string;
  color?: string;
  small?: string;
  large?: string;
  sub: Record<number, { small?: string; large?: string }>;
}
export interface AssetBundle {
  heroes: Record<number, HeroAsset>;
  ranks: Record<number, RankAsset>;
  fetchedAt: number;
  source: "live" | "cache" | "demo" | "none";
}

const ASSETS = () => (process.env.DEADLOCK_ASSETS_URL || "https://assets.deadlock-api.com").replace(/\/$/, "");
const TTL = 12 * 3600 * 1000;
const g = globalThis as unknown as { __dlAssets?: AssetBundle };

import { imgUrl } from "./img";

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
      color: toHex(colors.highlight) ?? toHex(colors.ui) ?? toHex(colors.glow_enemy) ?? hashColor(id),
      portrait: imgUrl(firstStr(im, ["icon_hero_card", "selection_image", "top_bar_vertical_image", "icon_image_small"])),
      small: imgUrl(firstStr(im, ["icon_image_small", "minimap_image", "icon_hero_card", "top_bar_vertical_image"])),
      art: imgUrl(firstStr(im, ["background_image", "selection_image", "icon_hero_card", "top_bar_vertical_image"])),
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
        small: imgUrl(firstStr(im, [`small_subrank${n}`, `small_subrank_${n}`])),
        large: imgUrl(firstStr(im, [`large_subrank${n}`, `large_subrank_${n}`])),
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
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getAssets(): Promise<AssetBundle> {
  if (isDemo()) {
    const heroes: Record<number, HeroAsset> = {};
    for (const h of DEMO_HEROES) heroes[h.id] = { id: h.id, name: h.name, color: hashColor(h.id) };
    return { heroes, ranks: {}, fetchedAt: Date.now(), source: "demo" };
  }
  if (g.__dlAssets && Date.now() - g.__dlAssets.fetchedAt < (g.__dlAssets.source === "live" ? TTL : 60_000)) return g.__dlAssets;
  try {
    const [h, r] = await Promise.all([getJson(`${ASSETS()}/v2/heroes`), getJson(`${ASSETS()}/v2/ranks`).catch(() => [])]);
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
