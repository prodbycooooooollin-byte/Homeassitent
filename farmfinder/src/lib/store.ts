import { useCallback, useEffect, useState } from 'react';
import type { Build, Farm, ItemEntry } from './types';

export interface State {
  apiKey: string;
  version: string | null;
  lang: 'de' | 'en';
  favorites: Farm[];
  builds: Build[];
  custom: Farm[];
}

const KEY = 'farmfinder.v1';
const DEFAULT: State = { apiKey: '', version: '26.3', lang: 'de', favorites: [], builds: [], custom: [] };

export function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export function useStore() {
  const [state, setState] = useState<State>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Speicher voll/gesperrt */ }
  }, [state]);
  const patch = useCallback((p: Partial<State>) => setState((s) => ({ ...s, ...p })), []);
  const update = useCallback((fn: (s: State) => State) => setState(fn), []);
  return { state, patch, update, replace: setState };
}

export type Store = ReturnType<typeof useStore>;

export function newBuild(farm: Farm): Build {
  return {
    id: uid(),
    farm,
    items: farm.items.map((i) => ({ id: uid(), name: i.name, count: i.count, done: false })),
    notes: '',
    coords: '',
    createdAt: Date.now(),
    done: false,
  };
}

/** Summiert offene Items aller aktiven Projekte (für die Einkaufsliste). */
export function shoppingList(builds: Build[]): { name: string; count: number; from: string[] }[] {
  const map = new Map<string, { name: string; count: number; from: string[] }>();
  for (const b of builds) {
    if (b.done) continue;
    for (const it of b.items) {
      if (it.done) continue;
      const k = it.name.toLowerCase();
      const e = map.get(k) ?? { name: it.name, count: 0, from: [] };
      e.count += it.count;
      e.from.push(b.farm.title);
      map.set(k, e);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export const progress = (items: ItemEntry[]) =>
  items.length ? items.filter((i) => i.done).length / items.length : 0;
