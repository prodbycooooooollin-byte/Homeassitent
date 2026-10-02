// Speicherung des Hauses in Home Assistant (Benutzerdaten des angemeldeten
// HA-Kontos, Befehle frontend/get_user_data und frontend/set_user_data).
// So sehen alle Geräte, die sich mit demselben Konto anmelden, dasselbe Haus.
// Zusätzlich liegt eine Kopie im Browser für den Start ohne Verbindung.
import type { Project } from "@/model/types";
import { parseProject, toProjectFile } from "@/model/schema";
import type { DirectSource } from "@/sources/direct";
import type { SaveOutcome } from "./persistence";

export const HA_PROJECT_KEY = "lumahome_project";
const CACHE_KEY = "lumahome.ha.cache.v1";

interface Stored {
  revision: number;
  savedAt: string;
  file: ReturnType<typeof toProjectFile>;
}

export async function loadFromHa(src: DirectSource): Promise<{ project: Project; revision: number } | null> {
  const raw = await src.getUserData<Stored>(HA_PROJECT_KEY);
  if (!raw) return null;
  const parsed = parseProject(raw.file?.project);
  if (!parsed.ok) throw new Error(`Das in Home Assistant gespeicherte Haus ist ungültig: ${parsed.errors.join("; ")}`);
  writeCache(parsed.value, raw.revision);
  return { project: parsed.value, revision: raw.revision };
}

export async function saveToHa(src: DirectSource, project: Project, baseRevision: number | null): Promise<SaveOutcome> {
  try {
    const current = await src.getUserData<Stored>(HA_PROJECT_KEY);
    const rev = current?.revision ?? 0;
    if (baseRevision !== null && current && baseRevision !== rev) {
      return { ok: false, conflict: true, forbidden: false, message: "Das Haus wurde zwischenzeitlich an einem anderen Gerät geändert." };
    }
    const stored: Stored = { revision: rev + 1, savedAt: new Date().toISOString(), file: toProjectFile(project) };
    await src.setUserData(HA_PROJECT_KEY, stored);
    writeCache(project, stored.revision);
    return { ok: true, revision: stored.revision };
  } catch (e) {
    return { ok: false, conflict: false, forbidden: false, message: (e as Error).message };
  }
}

export function readCache(): { project: Project; revision: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as { project: unknown; revision: number };
    const p = parseProject(c.project);
    return p.ok ? { project: p.value, revision: c.revision } : null;
  } catch {
    return null;
  }
}

function writeCache(project: Project, revision: number) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ project, revision }));
  } catch {
    /* zu groß oder gesperrt – Home Assistant bleibt maßgeblich */
  }
}

export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignorieren */
  }
}
