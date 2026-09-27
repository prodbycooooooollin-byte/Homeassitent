import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSteamInf } from './extract';

// Liest (nur lesend) die Versionsdatei der lokalen Deadlock-Installation, um zu prüfen,
// ob die mitgelieferten Spieldaten zum installierten Build passen. Kein Zugriff auf den Spielprozess.

const STEAM_ROOTS = [
  'C:\\Program Files (x86)\\Steam',
  'C:\\Program Files\\Steam',
  path.join(process.env.HOME ?? '', '.local/share/Steam'),
];

function libraryFolders(steamRoot: string): string[] {
  const vdf = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  try {
    const text = fs.readFileSync(vdf, 'utf8');
    return [...text.matchAll(/"path"\s+"([^"]+)"/g)].map((m) => m[1].replace(/\\\\/g, '\\'));
  } catch { return []; }
}

export function findSteamInf(extraPaths: string[] = []): string | null {
  const libs = new Set<string>(extraPaths);
  for (const r of STEAM_ROOTS) { libs.add(r); for (const l of libraryFolders(r)) libs.add(l); }
  for (const lib of libs) {
    const p = path.join(lib, 'steamapps', 'common', 'Deadlock', 'game', 'citadel', 'steam.inf');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function installedBuild(extraPaths: string[] = []): { build: number; versionDate: string; path: string } | null {
  const p = findSteamInf(extraPaths);
  if (!p) return null;
  try { return { ...parseSteamInf(fs.readFileSync(p, 'utf8')), path: p }; } catch { return null; }
}
