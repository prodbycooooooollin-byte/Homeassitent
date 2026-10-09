"use client";
import { useEffect, useState } from "react";
import type { ItemAsset } from "@/lib/assets";

let cache: Record<number, ItemAsset> | null = null;
let inflight: Promise<Record<number, ItemAsset>> | null = null;

/** Item-Assets (Name, Icon, Tier) – erst beim Öffnen des Items-Tabs geladen und danach gecacht. */
export function useItems(): Record<number, ItemAsset> | null {
  const [items, setItems] = useState(cache);
  useEffect(() => {
    if (cache) return;
    inflight ??= fetch("/api/items").then((r) => r.json()).then((j) => (cache = j.items ?? {})).catch(() => ({}));
    inflight.then((m) => setItems(m));
  }, []);
  return items;
}
