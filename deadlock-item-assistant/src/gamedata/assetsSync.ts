// Holt offizielle Item-/Heldennamen in der Spielsprache, Icons und IDs aus der
// Community-Assets-API (api.deadlock-api.com/v1/assets). Die Namen stammen aus den
// Lokalisierungsdateien des Spiels – es wird nichts selbst übersetzt.
// Schema laut @deadlock-api/ui-core (Item: id, class_name, name, shop_image_small, image, …).
// STATUS: in der Entwicklungsumgebung nicht erreichbar (Netzwerk gesperrt) → gegen die echte API ungetestet.

export interface LocalizedData {
  language: string;
  fetchedAt: string;
  source: string;
  items: Record<string, { name?: string; id?: number; image?: string }>;
  heroes: Record<string, { name?: string; image?: string }>;
}

interface AssetItem { id?: number; class_name?: string; name?: string; shop_image_small?: string | null; shop_image?: string | null; image?: string | null; type?: string }
interface AssetHero { id?: number; class_name?: string; name?: string; images?: { icon_image_small?: string | null; icon_hero_card?: string | null } | null }

export async function fetchLocalizedAssets(language: string, fetchImpl: typeof fetch = fetch, base = 'https://api.deadlock-api.com/v1/assets'): Promise<LocalizedData> {
  const get = async <T>(url: string): Promise<T> => {
    let last: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetchImpl(url);
        if (r.status === 429) throw new Error('Rate-Limit (429)');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as T;
      } catch (e) { last = e; await new Promise((res) => setTimeout(res, 1000 * 2 ** i)); }
    }
    throw last;
  };
  const items = await get<AssetItem[]>(`${base}/items?language=${encodeURIComponent(language)}`);
  const heroes = await get<AssetHero[]>(`${base}/heroes?language=${encodeURIComponent(language)}`);
  const out: LocalizedData = { language, fetchedAt: new Date().toISOString(), source: base, items: {}, heroes: {} };
  for (const it of items) {
    if (!it.class_name) continue;
    out.items[it.class_name] = { name: it.name, id: it.id, image: it.shop_image_small ?? it.shop_image ?? it.image ?? undefined };
  }
  for (const h of heroes) {
    if (!h.class_name) continue;
    out.heroes[h.class_name] = { name: h.name, image: h.images?.icon_image_small ?? h.images?.icon_hero_card ?? undefined };
  }
  return out;
}
