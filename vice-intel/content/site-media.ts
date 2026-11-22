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

export type SiteSlot =
  | "hero"
  | "scan"
  | "missions"
  | "unlocks"
  | "easter-eggs"
  | "money"
  | "map"
  | "missions-header"
  | "unlocks-header"
  | "easter-eggs-header"
  | "money-header";

const CONCEPT = { label: "VICE INTEL concept art (AI-generated)", license: "Project asset pack" };
const concept = (file: string, alt: string, focal?: { x: number; y: number }): SiteImage => ({
  src: `/media/concept/${file}.webp`,
  alt,
  attribution: CONCEPT,
  authenticGameplay: false,
  focal,
});

export const siteMedia: Partial<Record<SiteSlot, SiteImage>> = {
  hero: concept("sunset-skyline", "Concept art: palm trees and a city skyline at sunset", { x: 0.6, y: 0.6 }),
  scan: concept("cover-intel-scan", "Concept art: a supercar framed by scan brackets", { x: 0.55, y: 0.5 }),
  missions: concept("cover-mission-solver", "Concept art: a figure with a rifle and a helicopter at dusk", { x: 0.6, y: 0.45 }),
  unlocks: concept("cover-unlocks", "Concept art: a locked crate in a dark garage"),
  "easter-eggs": concept("cover-easter-eggs", "Concept art: a satellite dish painted with an eye symbol"),
  money: concept("cover-money-intel", "Concept art: a duffel bag full of cash"),
  "missions-header": concept("neon-street", "Concept art: neon-lit street at night", { x: 0.5, y: 0.4 }),
  "unlocks-header": concept("sunset-skyline", "Concept art: skyline at sunset", { x: 0.5, y: 0.6 }),
  "easter-eggs-header": concept("everglades", "Concept art: airboat in a swamp at sunset", { x: 0.5, y: 0.55 }),
  "money-header": concept("beach-aerial", "Concept art: aerial view of a beach and high-rises", { x: 0.5, y: 0.5 }),
};
