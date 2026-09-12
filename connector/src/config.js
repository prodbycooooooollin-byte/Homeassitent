import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = process.env.CRAFTBOARD_CONFIG || path.join(__dirname, "..", "config.json");

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(
      `Keine Konfiguration gefunden unter ${CONFIG_PATH}.\n` +
        "Kopiere config.example.json nach config.json und trage deine Werte ein.",
    );
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

  const required = ["craftboardUrl", "agentApiKey", "serverDir"];
  for (const key of required) {
    if (!raw[key]) {
      console.error(`Konfigurationsfeld "${key}" fehlt in ${CONFIG_PATH}.`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(raw.serverDir)) {
    console.error(`serverDir "${raw.serverDir}" existiert nicht.`);
    process.exit(1);
  }

  return {
    craftboardUrl: raw.craftboardUrl.replace(/\/$/, ""),
    agentApiKey: raw.agentApiKey,
    serverDir: raw.serverDir,
    rcon: raw.rcon?.enabled ? raw.rcon : null,
    statsIntervalSeconds: raw.statsIntervalSeconds ?? 300,
    positionIntervalSeconds: raw.positionIntervalSeconds ?? 15,
  };
}
