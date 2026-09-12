// Sehr kleiner lokaler Zustand: nur die Leseposition der Logdatei, damit
// ein Neustart des Agents nicht die komplette Logdatei erneut verarbeitet.
// Alle anderen Daten (Spielerliste, Statistiken) werden bei jedem Zyklus
// frisch von der Festplatte gelesen statt zwischengespeichert.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = process.env.CRAFTBOARD_STATE || path.join(__dirname, "..", "state.json");

export function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { logOffset: 0 };
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { logOffset: 0 };
  }
}

export function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state));
}
