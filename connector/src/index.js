// Craftboard-Connector-Agent
//
// Läuft auf demselben Rechner wie der Minecraft-Server (braucht lokalen
// Dateizugriff auf den Server-Ordner). Liest NUR lokal vorhandene Dateien
// und sendet periodisch Zusammenfassungen an die Craftboard-Webapp -
// Zugangsdaten (Agent-Key, RCON-Passwort) verlassen diesen Rechner nie in
// Klartext an Dritte, nur verschlüsselt (HTTPS) an die konfigurierte
// craftboardUrl.
//
// Start: node src/index.js  (siehe README.md für die Einrichtung)
import { loadConfig } from "./config.js";
import { loadState, saveState } from "./state.js";
import { createApiClient } from "./api.js";
import { getLogPath, readNewLines } from "./logTailer.js";
import { parseLogLine } from "./logParser.js";
import { loadUsercache, readAllPlayerStats } from "./statsReader.js";
import { offlineUuidFor } from "./uuid.js";
import { fetchPositions, fetchOnlineList } from "./positions.js";
import { runRconCommands } from "./rcon.js";

const config = loadConfig();
const state = loadState();
const api = createApiClient(config);

const onlineUsernames = new Set();
let usercache = loadUsercache(config.serverDir);

function uuidForUsername(username) {
  for (const [uuid, name] of usercache) {
    if (name === username) return uuid;
  }
  // usercache.json wird erst beim Login geschrieben und manchmal verzögert -
  // Offline-UUID ist der korrekte Wert für offline-mode=true-Server und ein
  // stabiler Platzhalter, falls die Zuordnung (noch) fehlt.
  return offlineUuidFor(username);
}

const capabilities = ["statsFiles", "logTail", ...(config.rcon ? ["rcon"] : [])];

console.log(`[craftboard] Agent gestartet. Ziel: ${config.craftboardUrl}`);
console.log(`[craftboard] Fähigkeiten: ${capabilities.join(", ")}`);

await api.serverStatus({ event: "start", at: new Date().toISOString() });

// --- Log-Tailing (alle ~2s neue Zeilen verarbeiten) ---------------------
async function pollLog() {
  const lines = readNewLines(getLogPath(config.serverDir), state);
  if (lines.length > 0) saveState(state);

  for (const rawLine of lines) {
    const event = parseLogLine(rawLine, onlineUsernames);
    if (!event) continue;

    if (event.type === "join") {
      onlineUsernames.add(event.username);
      usercache = loadUsercache(config.serverDir); // frisch, UUID meist gerade geschrieben
      await api.sessionEvent({
        uuid: uuidForUsername(event.username),
        username: event.username,
        type: "join",
        at: new Date().toISOString(),
      });
    } else if (event.type === "leave") {
      onlineUsernames.delete(event.username);
      await api.sessionEvent({
        uuid: uuidForUsername(event.username),
        username: event.username,
        type: "leave",
        at: new Date().toISOString(),
      });
    } else if (event.type === "death") {
      await api.death({
        uuid: uuidForUsername(event.username),
        username: event.username,
        at: new Date().toISOString(),
        message: event.message,
      });
    } else if (event.type === "link") {
      const uuid = uuidForUsername(event.username);
      const result = await api.link({ code: event.code, uuid, username: event.username });
      if (config.rcon && result) {
        const feedback = result.ok
          ? `{"text":"[Craftboard] ${result.message}","color":"green"}`
          : `{"text":"[Craftboard] ${result.message}","color":"red"}`;
        runRconCommands(config.rcon.host, config.rcon.port, config.rcon.password, [
          `tellraw ${event.username} ${feedback}`,
        ]).catch(() => {});
      }
    }
  }
}

// --- Vollständiger Statistik-Zyklus -------------------------------------
async function pollStats() {
  let maxPlayers;
  if (config.rcon) {
    const list = await fetchOnlineList(config.rcon);
    if (list) {
      maxPlayers = list.max;
      // RCON-Liste ist die verlässlichere Quelle - mit dem Log-basierten
      // Online-Set abgleichen, falls eine Zeile verpasst wurde.
      onlineUsernames.clear();
      list.names.forEach((n) => onlineUsernames.add(n));
    }
  }

  usercache = loadUsercache(config.serverDir);
  const players = readAllPlayerStats(config.serverDir, usercache, onlineUsernames);

  if (players.length === 0) {
    console.log("[craftboard] Noch keine Statistikdateien gefunden (world/stats) - Snapshot übersprungen.");
    return;
  }

  await api.snapshot({
    capturedAt: new Date().toISOString(),
    capabilities,
    maxPlayers,
    players,
  });
  console.log(`[craftboard] Snapshot gesendet (${players.length} Spieler, ${onlineUsernames.size} online).`);
}

// --- Live-Positionen (nur mit RCON) -------------------------------------
async function pollPositions() {
  if (!config.rcon || onlineUsernames.size === 0) return;
  const names = [...onlineUsernames];
  const positions = await fetchPositions(config.rcon, names);
  if (positions.size === 0) return;

  const payload = names
    .filter((name) => positions.has(name))
    .map((name) => ({ uuid: uuidForUsername(name), username: name, ...positions.get(name) }));

  await api.positions({ positions: payload });
}

// --- Zyklen starten ------------------------------------------------------
setInterval(() => pollLog().catch((e) => console.error("[craftboard] Log-Fehler:", e.message)), 2000);
setInterval(
  () => pollStats().catch((e) => console.error("[craftboard] Snapshot-Fehler:", e.message)),
  config.statsIntervalSeconds * 1000,
);
if (config.rcon) {
  setInterval(
    () => pollPositions().catch((e) => console.error("[craftboard] Positions-Fehler:", e.message)),
    config.positionIntervalSeconds * 1000,
  );
}

// Sofort einmal ausführen, nicht erst nach dem ersten Intervall warten.
await pollStats();

async function shutdown() {
  console.log("[craftboard] Agent wird beendet…");
  await api.serverStatus({ event: "stop", at: new Date().toISOString() }).catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
