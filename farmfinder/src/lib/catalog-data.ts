import type { Farm } from './types';

export interface CatalogFile {
  generated: string | null;
  entries: Record<string, Farm[]>;
}

let cache: Promise<CatalogFile> | undefined;

/** Vorab per GitHub Action gesammelte Videos (public/catalog.json) – funktioniert ohne eigenen API-Key. */
export function loadCatalog(): Promise<CatalogFile> {
  cache ??= fetch(`${import.meta.env.BASE_URL}catalog.json`)
    .then((r) => (r.ok ? r.json() : { generated: null, entries: {} }))
    .catch(() => ({ generated: null, entries: {} }));
  return cache;
}

export function farmsForType(cat: CatalogFile, typeId: string): Farm[] {
  const seen = new Map<string, Farm>();
  for (const [key, farms] of Object.entries(cat.entries)) {
    if (key.split('|')[0] !== typeId) continue;
    for (const f of farms) if (!seen.has(f.id)) seen.set(f.id, f);
  }
  return [...seen.values()];
}
