// Dateibasierte Speicherung des Live-Projekts auf dem lokalen Server.
// Atomares Schreiben (temporäre Datei + Umbenennen), Revisionsprüfung gegen
// gleichzeitige Bearbeitung und die letzten 20 Stände als Sicherung.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseProject } from "../src/model/schema";
import { toProjectFile } from "../src/model/schema";
import type { Project } from "../src/model/types";
import { config } from "./config";

interface Stored {
  revision: number;
  savedAt: string;
  file: ReturnType<typeof toProjectFile>;
}

const file = () => join(config.dataDir, "project.json");
const backupDir = () => join(config.dataDir, "backups");

export function loadProject(): { project: Project; revision: number; savedAt: string } | null {
  if (!existsSync(file())) return null;
  const raw = JSON.parse(readFileSync(file(), "utf8")) as Stored;
  const parsed = parseProject(raw.file?.project);
  if (!parsed.ok) throw new Error(`Gespeichertes Projekt ist ungültig: ${parsed.errors.join("; ")}`);
  return { project: parsed.value, revision: raw.revision, savedAt: raw.savedAt };
}

export type SaveResult =
  | { ok: true; revision: number; savedAt: string }
  | { ok: false; status: 409; revision: number }
  | { ok: false; status: 422; errors: string[] };

export function saveProject(input: unknown, baseRevision: number | null): SaveResult {
  const parsed = parseProject(input);
  if (!parsed.ok) return { ok: false, status: 422, errors: parsed.errors };
  mkdirSync(config.dataDir, { recursive: true });
  let current: Stored | null = null;
  if (existsSync(file())) current = JSON.parse(readFileSync(file(), "utf8")) as Stored;
  const currentRev = current?.revision ?? 0;
  if (baseRevision !== null && baseRevision !== currentRev) return { ok: false, status: 409, revision: currentRev };
  if (current) {
    mkdirSync(backupDir(), { recursive: true });
    writeFileSync(join(backupDir(), `project-r${String(currentRev).padStart(6, "0")}.json`), JSON.stringify(current));
    const all = readdirSync(backupDir()).filter((f) => f.startsWith("project-r")).sort();
    for (const old of all.slice(0, Math.max(0, all.length - 20))) unlinkSync(join(backupDir(), old));
  }
  const stored: Stored = { revision: currentRev + 1, savedAt: new Date().toISOString(), file: toProjectFile(parsed.value) };
  const tmp = file() + ".tmp";
  writeFileSync(tmp, JSON.stringify(stored));
  renameSync(tmp, file());
  return { ok: true, revision: stored.revision, savedAt: stored.savedAt };
}
