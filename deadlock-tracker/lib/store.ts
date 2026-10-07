import fs from "fs";
import path from "path";
import type { StoreShape } from "./types";

const FILE = process.env.TRACKER_DATA_FILE || path.join(process.cwd(), "data", "store.json");

/** Verzeichnis für Store und Asset-Cache (im Desktop-Build das Benutzerprofil). */
export const dataDir = () => path.dirname(FILE);

const g = globalThis as unknown as { __dlStore?: StoreShape };

function load(): StoreShape {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as StoreShape;
    if (parsed.version === 1) return parsed;
  } catch {
    /* neu anlegen */
  }
  return { version: 1, players: {}, matches: {} };
}

export function getStore(): StoreShape {
  if (!g.__dlStore) g.__dlStore = load();
  return g.__dlStore;
}

/** Atomar schreiben (tmp + rename), damit ein Absturz nie einen halben Store hinterlässt. */
export function saveStore(): void {
  const store = getStore();
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store));
  fs.renameSync(tmp, FILE);
}

export function resetStoreForTests(): void {
  g.__dlStore = { version: 1, players: {}, matches: {} };
}
