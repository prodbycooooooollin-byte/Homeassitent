import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || "./storage");

export async function saveUploadedFile(
  subdir: string,
  originalName: string,
  data: Buffer,
): Promise<{ filePath: string; fileName: string }> {
  const dir = path.join(STORAGE_DIR, subdir);
  await fs.mkdir(dir, { recursive: true });
  const safeExt = path.extname(originalName).slice(0, 20);
  const fileName = `${crypto.randomUUID()}${safeExt}`;
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, data);
  // Relativer Pfad (ab storage/) wird in der DB gespeichert, damit
  // STORAGE_DIR später verschoben werden kann.
  return { filePath: path.join(subdir, fileName), fileName: originalName };
}

export function resolveStoragePath(relativePath: string): string {
  const resolved = path.resolve(STORAGE_DIR, relativePath);
  if (!resolved.startsWith(STORAGE_DIR)) {
    throw new Error("Ungültiger Speicherpfad.");
  }
  return resolved;
}

export async function readStoredFile(relativePath: string): Promise<Buffer> {
  return fs.readFile(resolveStoragePath(relativePath));
}
