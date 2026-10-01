// Serverkonfiguration aus Umgebungsvariablen bzw. .env (nicht eingecheckt).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const [, k, raw] = m;
    if (process.env[k] !== undefined) continue;
    process.env[k] = raw.replace(/^["']|["']$/g, "");
  }
}

loadDotEnv(resolve(process.cwd(), ".env"));

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "127.0.0.1",
  haUrl: clean(process.env.HA_URL)?.replace(/\/+$/, "") ?? null,
  haToken: clean(process.env.HA_TOKEN),
  viewPin: clean(process.env.LUMAHOME_VIEW_PIN),
  editPin: clean(process.env.LUMAHOME_EDIT_PIN),
  dataDir: resolve(process.cwd(), process.env.LUMAHOME_DATA_DIR ?? "./data"),
  distDir: resolve(process.cwd(), "dist"),
  /** Selbstsignierte Zertifikate der HA-Instanz akzeptieren (nur im Heimnetz sinnvoll) */
  haInsecureTls: process.env.HA_INSECURE_TLS === "1",
};

export const haConfigured = () => !!(config.haUrl && config.haToken);

/** Nur Host und Port – der vollständige Pfad und das Token werden nie ausgeliefert. */
export function haHostLabel(): string | null {
  if (!config.haUrl) return null;
  try {
    const u = new URL(config.haUrl);
    return u.host;
  } catch {
    return "ungültige Adresse";
  }
}
