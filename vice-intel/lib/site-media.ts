import { siteMedia, type SiteSlot } from "@/content/site-media";
import type { ArtScene } from "@/lib/content/schema";

/** Media for a page slot: the registered image if there is one, otherwise the built-in illustration. */
export function slotMedia(slot: SiteSlot, scene: ArtScene, seed: number, alt = "") {
  const img = siteMedia[slot];
  return img ? { alt: img.alt, src: img.src, focal: img.focal } : { alt, art: { scene, seed } };
}
