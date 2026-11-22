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

export const mediaOverrides: Record<string, z.input<typeof mediaSchema>[]> = {};
