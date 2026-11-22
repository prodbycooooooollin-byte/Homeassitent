/**
 * Images for the home hero, the module tiles and the page headers.
 *
 * Put your own screenshots (e.g. captured on your console) or other images you
 * have the rights to in /public/media and register them here. Anything left
 * empty falls back to the built-in illustration.
 *
 * Example:
 *   hero: {
 *     src: "/media/hero-vice-city.webp",
 *     alt: "Sunset over the Vice City skyline",
 *     attribution: { label: "Own capture (PS5)", license: "Own screenshot" },
 *     authenticGameplay: true,
 *   },
 */
export interface SiteImage {
  src: string;
  alt: string;
  attribution: { label: string; license: string; url?: string };
  /** true only for real in-game captures */
  authenticGameplay?: boolean;
  focal?: { x: number; y: number };
}

export type SiteSlot = "hero" | "scan" | "missions" | "unlocks" | "easter-eggs" | "money" | "map";

export const siteMedia: Partial<Record<SiteSlot, SiteImage>> = {};
