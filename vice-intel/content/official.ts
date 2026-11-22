import type { EntityInput } from "@/lib/content/schema";

/**
 * Records based on OFFICIAL pre-release material published by Rockstar Games.
 * Descriptions are deliberately conservative: they only restate what the
 * official website and trailers presented. In-game specifics belong in
 * separately verified records.
 */

function art(
  id: string,
  scene:
    | "skyline"
    | "beach"
    | "keys"
    | "swamp"
    | "mountain"
    | "highway"
    | "industrial"
    | "suburb"
    | "harbor"
    | "interior",
  seed: number,
  alt: string,
) {
  return {
    id,
    alt,
    art: { scene, seed },
    attribution: { label: "VICE INTEL original illustration", license: "CC BY 4.0 (VICE INTEL)" },
    authenticGameplay: false,
  };
}

const OFFICIAL_NOTE =
  "Presented in Rockstar's official pre-release material. In-game details may differ and will be verified separately.";

export const officialRecords: EntityInput[] = [
  {
    id: "location:vice-city",
    kind: "location",
    slug: "vice-city",
    title: "Vice City",
    aliases: ["vc", "the city", "miami"],
    summary:
      "The sun-soaked metropolis at the heart of the state of Leonida, presented as the main city of Grand Theft Auto VI.",
    region: "Leonida",
    character: "Dense coastal metropolis — beaches, nightlife, high-rises and the port.",
    highlights: ["Beaches and ocean drive", "Downtown skyline", "Nightlife districts", "Port and waterways"],
    tags: ["city", "urban", "coast", "nightlife"],
    verification: { status: "official", note: OFFICIAL_NOTE, checkedAt: "2026-11-20" },
    sources: ["rockstar-vi-site", "rockstar-trailer-1", "rockstar-trailer-2"],
    media: [art("vc-hero", "skyline", 11, "Illustrated sunset skyline of a coastal city with palm trees")],
    mapPoint: { x: 742, y: 700, precision: "region" },
    related: ["location:leonida-keys", "location:grassrivers"],
    updatedAt: "2026-11-20",
  },
  {
    id: "location:leonida-keys",
    kind: "location",
    slug: "leonida-keys",
    title: "Leonida Keys",
    aliases: ["the keys", "keys", "islands"],
    summary: "A chain of islands off the southern tip of Leonida, shown on Rockstar's official GTA VI website.",
    region: "Leonida",
    character: "Island chain — bridges, open water, small coastal communities.",
    highlights: ["Island-hopping bridges", "Open water", "Coastal towns"],
    tags: ["islands", "water", "bridges", "coast"],
    verification: { status: "official", note: OFFICIAL_NOTE, checkedAt: "2026-11-20" },
    sources: ["rockstar-vi-site", "rockstar-trailer-2"],
    media: [art("keys-hero", "keys", 23, "Illustrated island chain with a long bridge at dusk")],
    mapPoint: { x: 600, y: 905, precision: "region" },
    related: ["location:vice-city"],
    updatedAt: "2026-11-20",
  },
  {
    id: "location:grassrivers",
    kind: "location",
    slug: "grassrivers",
    title: "Grassrivers",
    aliases: ["wetlands", "swamp", "everglades", "glades"],
    summary: "Leonida's vast wetlands, presented on the official website as wild, swampy backcountry.",
    region: "Leonida",
    character: "Wetlands — airboat channels, wildlife, isolated settlements.",
    highlights: ["Swamp channels", "Wildlife", "Remote backcountry"],
    tags: ["wetlands", "swamp", "nature", "wildlife"],
    verification: { status: "official", note: OFFICIAL_NOTE, checkedAt: "2026-11-20" },
    sources: ["rockstar-vi-site", "rockstar-trailer-2"],
    media: [art("gr-hero", "swamp", 37, "Illustrated swamp at sunset with mangroves and still water")],
    mapPoint: { x: 590, y: 720, precision: "region" },
    related: ["location:vice-city"],
    updatedAt: "2026-11-20",
  },
  {
    id: "location:port-gellhorn",
    kind: "location",
    slug: "port-gellhorn",
    title: "Port Gellhorn",
    aliases: ["gellhorn"],
    summary: "A coastal port town in Leonida featured on the official GTA VI website.",
    region: "Leonida",
    character: "Faded port town — docks, motels and industry along the coast.",
    highlights: ["Docks", "Coastal industry", "Small-town strip"],
    tags: ["port", "town", "coast", "industrial"],
    verification: { status: "official", note: OFFICIAL_NOTE, checkedAt: "2026-11-20" },
    sources: ["rockstar-vi-site"],
    media: [art("pg-hero", "harbor", 41, "Illustrated quiet harbor with cranes and a fading sky")],
    mapPoint: { x: 250, y: 230, precision: "region" },
    related: ["location:ambrosia"],
    updatedAt: "2026-11-20",
  },
  {
    id: "location:ambrosia",
    kind: "location",
    slug: "ambrosia",
    title: "Ambrosia",
    aliases: [],
    summary: "An inland industrial town in Leonida featured on the official GTA VI website.",
    region: "Leonida",
    character: "Inland industry — factories, rail lines and rural roads.",
    highlights: ["Industrial skyline", "Rural highways", "Rail lines"],
    tags: ["inland", "industrial", "rural", "town"],
    verification: { status: "official", note: OFFICIAL_NOTE, checkedAt: "2026-11-20" },
    sources: ["rockstar-vi-site"],
    media: [art("amb-hero", "industrial", 53, "Illustrated inland factory town under an orange sky")],
    mapPoint: { x: 520, y: 430, precision: "region" },
    related: ["location:mount-kalaga", "location:port-gellhorn"],
    updatedAt: "2026-11-20",
  },
  {
    id: "location:mount-kalaga",
    kind: "location",
    slug: "mount-kalaga",
    title: "Mount Kalaga National Park",
    aliases: ["kalaga", "national park", "mountain"],
    summary: "A wilderness national park in northern Leonida, presented on the official GTA VI website.",
    region: "Leonida",
    character: "Wilderness — forests, trails, lakes and high ground.",
    highlights: ["Forest trails", "Lakes", "Elevated terrain"],
    tags: ["nature", "park", "forest", "hiking", "wilderness"],
    verification: { status: "official", note: OFFICIAL_NOTE, checkedAt: "2026-11-20" },
    sources: ["rockstar-vi-site"],
    media: [art("mk-hero", "mountain", 67, "Illustrated forested mountain range at dawn")],
    mapPoint: { x: 470, y: 180, precision: "region" },
    related: ["location:ambrosia"],
    updatedAt: "2026-11-20",
  },
  {
    id: "character:lucia",
    kind: "character",
    slug: "lucia-caminos",
    title: "Lucia Caminos",
    aliases: ["lucia"],
    summary: "One of the two playable protagonists of Grand Theft Auto VI, as presented by Rockstar Games.",
    role: "Protagonist",
    facts: ["Featured in Trailer 1 (December 2023)", "Profiled on the official GTA VI website"],
    tags: ["protagonist", "playable", "character"],
    verification: { status: "official", note: OFFICIAL_NOTE, checkedAt: "2026-11-20" },
    sources: ["rockstar-trailer-1", "rockstar-vi-site"],
    media: [art("lucia-hero", "interior", 71, "Abstract illustrated portrait backdrop in violet tones")],
    related: ["character:jason", "location:vice-city"],
    updatedAt: "2026-11-20",
  },
  {
    id: "character:jason",
    kind: "character",
    slug: "jason-duval",
    title: "Jason Duval",
    aliases: ["jason"],
    summary: "One of the two playable protagonists of Grand Theft Auto VI, as presented by Rockstar Games.",
    role: "Protagonist",
    facts: ["Featured alongside Lucia in Rockstar's official trailers", "Profiled on the official GTA VI website"],
    tags: ["protagonist", "playable", "character"],
    verification: { status: "official", note: OFFICIAL_NOTE, checkedAt: "2026-11-20" },
    sources: ["rockstar-trailer-2", "rockstar-vi-site"],
    media: [art("jason-hero", "highway", 73, "Abstract illustrated highway backdrop at dusk")],
    related: ["character:lucia", "location:leonida-keys"],
    updatedAt: "2026-11-20",
  },
];
