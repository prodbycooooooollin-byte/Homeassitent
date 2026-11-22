"use client";
/**
 * Per-device conveniences (bookmarks, recently viewed, spoiler preference).
 * Stored in localStorage; every access is guarded so private mode or blocked
 * storage never breaks the app. No account and no data entry required.
 */
import { useSyncExternalStore } from "react";
import type { VerificationStatus } from "@/lib/content/schema";

export interface SavedItem {
  id: string;
  title: string;
  href: string;
  kind: string;
  status: VerificationStatus;
  art?: { scene: string; seed: number };
  src?: string;
  savedAt: number;
}

export interface Prefs {
  spoilers: "hide" | "show";
}

interface State {
  bookmarks: SavedItem[];
  recents: SavedItem[];
  prefs: Prefs;
  recentQueries: string[];
}

const KEY = "vice-intel:v1";
const DEFAULT: State = { bookmarks: [], recents: [], prefs: { spoilers: "hide" }, recentQueries: [] };

let state: State = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...DEFAULT, ...JSON.parse(raw), prefs: { ...DEFAULT.prefs, ...JSON.parse(raw).prefs } };
  } catch {
    state = DEFAULT;
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — keep in memory only */
  }
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      loaded = false;
      load();
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return selector(state);
    },
    () => selector(DEFAULT),
  );
}

export const actions = {
  toggleBookmark(item: Omit<SavedItem, "savedAt">) {
    load();
    const exists = state.bookmarks.some((b) => b.id === item.id);
    set({
      bookmarks: exists ? state.bookmarks.filter((b) => b.id !== item.id) : [{ ...item, savedAt: Date.now() }, ...state.bookmarks].slice(0, 200),
    });
    return !exists;
  },
  pushRecent(item: Omit<SavedItem, "savedAt">) {
    load();
    set({ recents: [{ ...item, savedAt: Date.now() }, ...state.recents.filter((r) => r.id !== item.id)].slice(0, 12) });
  },
  pushQuery(q: string) {
    load();
    const t = q.trim();
    if (t.length < 2) return;
    set({ recentQueries: [t, ...state.recentQueries.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8) });
  },
  clearRecents() {
    set({ recents: [], recentQueries: [] });
  },
  setPrefs(p: Partial<Prefs>) {
    load();
    set({ prefs: { ...state.prefs, ...p } });
  },
};
