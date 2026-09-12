import { DEMO_PERSONAS } from "@/lib/demo/personas";
import type { PlayerListEntry, PlayerProfile } from "@/lib/queries/players";

const DAY = 24 * 60 * 60 * 1000;

// Deterministische, aber unterschiedliche Werte je Demo-Spieler (Index-basiert).
function seeded(i: number, base: number, spread: number) {
  return Math.round(base + ((i * 37) % 100) * (spread / 100));
}

export function getDemoPlayersList(): PlayerListEntry[] {
  return DEMO_PERSONAS.map((p, i) => ({
    uuid: p.uuid,
    username: p.username,
    isOnline: i < 3,
    lastSeenAt: i < 3 ? new Date(Date.now() - 60_000) : new Date(Date.now() - (i + 1) * DAY),
    firstSeenAt: new Date(Date.now() - (90 - i * 3) * DAY),
    playtimeTicks: seeded(i, 400_000, 900_000),
  }));
}

const DEMO_BLOCKS = [
  "minecraft:stone",
  "minecraft:deepslate",
  "minecraft:oak_log",
  "minecraft:dirt",
  "minecraft:diamond_ore",
  "minecraft:iron_ore",
];
const DEMO_MOBS = ["minecraft:zombie", "minecraft:skeleton", "minecraft:creeper", "minecraft:spider"];
const DEMO_ADVANCEMENTS = [
  "minecraft:story/mine_stone",
  "minecraft:story/smelt_iron",
  "minecraft:nether/root",
  "minecraft:end/root",
];

export function getDemoPlayerProfile(uuid: string): PlayerProfile | null {
  const index = DEMO_PERSONAS.findIndex((p) => p.uuid === uuid);
  if (index === -1) return null;
  const p = DEMO_PERSONAS[index];
  const list = getDemoPlayersList()[index];

  return {
    uuid: p.uuid,
    username: p.username,
    isOnline: list.isOnline,
    lastSeenAt: list.lastSeenAt,
    firstSeenAt: list.firstSeenAt,
    linkedUserId: null,
    totals: {
      playtimeTicks: list.playtimeTicks ?? 0,
      blocksMinedTotal: seeded(index, 8000, 30000),
      mobKillsTotal: seeded(index, 300, 900),
      deathsTotal: seeded(index, 10, 60),
    },
    blockStats: DEMO_BLOCKS.map((blockKey, bi) => ({ blockKey, count: seeded(index + bi, 500, 4000) })),
    mobStats: DEMO_MOBS.map((mobKey, mi) => ({ mobKey, kills: seeded(index + mi, 40, 200) })),
    distanceStats: [
      { type: "minecraft:walk_one_cm", cm: seeded(index, 500_000, 2_000_000) },
      { type: "minecraft:sprint_one_cm", cm: seeded(index, 300_000, 1_000_000) },
      { type: "minecraft:aviate_one_cm", cm: seeded(index, 50_000, 500_000) },
    ],
    advancements: DEMO_ADVANCEMENTS.slice(0, 2 + (index % 3)).map((advancementKey, ai) => ({
      advancementKey,
      unlockedAt: new Date(Date.now() - (60 - ai * 10) * DAY),
    })),
    ranks: { playtimeTicks: index + 1, blocksMinedTotal: ((index + 2) % DEMO_PERSONAS.length) + 1, mobKillsTotal: ((index + 4) % DEMO_PERSONAS.length) + 1 },
    latestDeath: null,
  };
}
