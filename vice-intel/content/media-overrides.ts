/**
 * Attach images to existing records without editing the records themselves.
 * Key = record id, value = images shown before the built-in illustration
 * (the first one becomes the header image; all appear in galleries).
 *
 * Example:
 *   "location:vice-city": [{
 *     id: "vc-capture-1",
 *     src: "/media/vice-city-beach.webp",
 *     alt: "Ocean drive at dusk",
 *     attribution: { label: "Own capture (PS5)", license: "Own screenshot" },
 *     authenticGameplay: true,
 *   }],
 */
import type { z } from "zod";
import type { mediaSchema } from "@/lib/content/schema";

const CONCEPT = { label: "VICE INTEL concept art (AI-generated)", license: "Project asset pack" };
const concept = (id: string, file: string, alt: string, extra: Partial<z.input<typeof mediaSchema>> = {}) => ({
  id,
  src: `/media/concept/${file}.webp`,
  alt,
  attribution: CONCEPT,
  authenticGameplay: false,
  ...extra,
});

export const mediaOverrides: Record<string, z.input<typeof mediaSchema>[]> = {
  "location:vice-city": [
    concept("vc-concept-skyline", "sunset-skyline", "Concept art: Vice City-style skyline at sunset", { focal: { x: 0.6, y: 0.6 } }),
    concept("vc-concept-beach", "beach-aerial", "Concept art: aerial beach and high-rises"),
    concept("vc-concept-street", "neon-street", "Concept art: neon street at night"),
  ],
  "location:grassrivers": [concept("gr-concept", "everglades", "Concept art: airboat in a swamp at sunset")],
  "unlock:demo-vortex-gt": [concept("vortex-concept", "vehicle-supercar", "Concept art: pink-violet supercar", { fit: "contain" })],
  "unlock:demo-swamp-skiff": [concept("skiff-concept", "vehicle-airboat", "Concept art: caged airboat", { fit: "contain" })],
  "easter-egg:demo-eye-dish": [concept("dish-concept", "cover-easter-eggs", "Concept art: satellite dish with a painted eye symbol")],
  "money:demo-depot-heist": [concept("heist-concept", "cover-money-intel", "Concept art: duffel bag full of cash")],
  "money:demo-airboat-tours": [concept("tours-concept", "everglades", "Concept art: airboat tour at sunset")],
  "money:demo-street-races": [concept("races-concept", "neon-street", "Concept art: neon street at night")],
};
