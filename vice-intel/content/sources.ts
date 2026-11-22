import type { Source } from "@/lib/content/schema";

/**
 * Source registry. Records reference sources by id.
 * Official sources are limited to material Rockstar Games itself published.
 */
export const sources: Source[] = [
  {
    id: "rockstar-vi-site",
    title: "Grand Theft Auto VI — official website (places & people)",
    publisher: "Rockstar Games",
    url: "https://www.rockstargames.com/VI",
    kind: "official",
    publishedAt: "2025-05-06",
  },
  {
    id: "rockstar-trailer-1",
    title: "Grand Theft Auto VI Trailer 1",
    publisher: "Rockstar Games",
    url: "https://www.rockstargames.com/VI",
    kind: "official",
    publishedAt: "2023-12-05",
  },
  {
    id: "rockstar-trailer-2",
    title: "Grand Theft Auto VI Trailer 2",
    publisher: "Rockstar Games",
    url: "https://www.rockstargames.com/VI",
    kind: "official",
    publishedAt: "2025-05-06",
  },
  {
    id: "rockstar-newswire",
    title: "Rockstar Newswire",
    publisher: "Rockstar Games",
    url: "https://www.rockstargames.com/newswire",
    kind: "official",
  },
  {
    id: "vice-intel-demo",
    title: "VICE INTEL demonstration dataset",
    publisher: "VICE INTEL (internal)",
    kind: "internal",
    publishedAt: "2026-11-22",
  },
];
