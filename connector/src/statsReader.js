// Liest die von Vanilla Minecraft selbst gepflegten Dateien unter
// world/stats/, world/advancements/ und usercache.json. Diese Daten
// existieren unabhängig von Fabric/Forge/Mods (vanilla Spielmechanik) und
// werden hier nur ausgelesen, nie verändert.
import fs from "node:fs";
import path from "node:path";

const DISTANCE_KEYS = [
  "minecraft:walk_one_cm",
  "minecraft:sprint_one_cm",
  "minecraft:swim_one_cm",
  "minecraft:aviate_one_cm",
  "minecraft:boat_one_cm",
  "minecraft:minecart_one_cm",
  "minecraft:horse_one_cm",
  "minecraft:climb_one_cm",
  "minecraft:crouch_one_cm",
  "minecraft:fall_one_cm",
];

function findWorldDir(serverDir) {
  // Der Standard-Weltordner heißt "world", kann aber per level-name in
  // server.properties abweichen - wir versuchen beides.
  const propsPath = path.join(serverDir, "server.properties");
  if (fs.existsSync(propsPath)) {
    const props = fs.readFileSync(propsPath, "utf8");
    const match = props.match(/^level-name=(.+)$/m);
    if (match) {
      const candidate = path.join(serverDir, match[1].trim());
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return path.join(serverDir, "world");
}

export function loadUsercache(serverDir) {
  const file = path.join(serverDir, "usercache.json");
  if (!fs.existsSync(file)) return new Map();
  try {
    const entries = JSON.parse(fs.readFileSync(file, "utf8"));
    return new Map(entries.map((e) => [e.uuid, e.name]));
  } catch {
    return new Map();
  }
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Liest alle jemals erfassten Spieler-Statistikdateien und liefert je
 * Spieler ein Objekt, das direkt in die snapshot-Payload der Ingest-API
 * passt (siehe lib/ingest/schemas.ts der Webapp).
 */
export function readAllPlayerStats(serverDir, usercache, onlineUsernames) {
  const worldDir = findWorldDir(serverDir);
  const statsDir = path.join(worldDir, "stats");
  const advancementsDir = path.join(worldDir, "advancements");

  if (!fs.existsSync(statsDir)) return [];

  const results = [];
  for (const file of fs.readdirSync(statsDir)) {
    if (!file.endsWith(".json")) continue;
    const uuid = file.replace(/\.json$/, "");
    const data = readJsonSafe(path.join(statsDir, file));
    if (!data?.stats) continue;

    const custom = data.stats["minecraft:custom"] ?? {};
    const mined = data.stats["minecraft:mined"] ?? {};
    const killed = data.stats["minecraft:killed"] ?? {};

    const playtimeTicks = custom["minecraft:play_time"] ?? custom["minecraft:playOneMinute"] ?? 0;
    const blocksMinedTotal = Object.values(mined).reduce((sum, n) => sum + n, 0);
    const mobKillsTotal = custom["minecraft:mob_kills"] ?? 0;
    const deathsTotal = custom["minecraft:deaths"] ?? 0;

    const distances = {};
    for (const key of DISTANCE_KEYS) {
      if (typeof custom[key] === "number" && custom[key] > 0) distances[key] = custom[key];
    }

    const advancements = [];
    const advFile = path.join(advancementsDir, `${uuid}.json`);
    const advData = fs.existsSync(advFile) ? readJsonSafe(advFile) : null;
    if (advData) {
      for (const [key, value] of Object.entries(advData)) {
        if (key === "DataVersion" || !value?.done) continue;
        const timestamps = Object.values(value.criteria ?? {}).filter(Boolean);
        const unlockedAt = timestamps.length ? new Date(timestamps.sort()[0]).toISOString() : new Date().toISOString();
        advancements.push({ key, unlockedAt });
      }
    }

    const username = usercache.get(uuid) ?? uuid;
    results.push({
      uuid,
      username,
      online: onlineUsernames.has(username),
      playtimeTicks,
      blocksMinedTotal,
      mobKillsTotal,
      deathsTotal,
      blocks: mined,
      mobs: killed,
      distances,
      advancements,
    });
  }
  return results;
}
