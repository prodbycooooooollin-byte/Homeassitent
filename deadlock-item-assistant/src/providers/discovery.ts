import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Automatische Erkennung ohne Anmeldung: Steam-Konto aus der lokalen Steam-Konfiguration,
// laufendes Deadlock über die Prozessliste, Match-ID über Community-API bzw. Konsolenprotokoll.
// Nur lesende Zugriffe auf Dateien/Prozessliste – nichts wird in das Spiel geschrieben.

const STEAM64_BASE = 76561197960265728n;

export interface SteamAccount { steamId64: string; accountId: number; personaName: string | null; source: string }

export function steamRoots(): string[] {
  return [
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)']!, 'Steam') : 'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    path.join(process.env.HOME ?? '', '.local/share/Steam'),
    path.join(process.env.HOME ?? '', '.steam/steam'),
  ];
}

/** Liest das zuletzt angemeldete Steam-Konto aus config/loginusers.vdf. */
export function parseLoginUsers(text: string): SteamAccount[] {
  const out: (SteamAccount & { recent: boolean; ts: number })[] = [];
  const re = /"(\d{17})"\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const body = m[2];
    const field = (k: string) => new RegExp(`"${k}"\\s*"([^"]*)"`, 'i').exec(body)?.[1] ?? null;
    const id64 = BigInt(m[1]);
    out.push({
      steamId64: m[1], accountId: Number(id64 - STEAM64_BASE), personaName: field('PersonaName'), source: 'loginusers.vdf',
      recent: field('MostRecent') === '1', ts: Number(field('Timestamp') ?? 0),
    });
  }
  out.sort((a, b) => Number(b.recent) - Number(a.recent) || b.ts - a.ts);
  return out.map(({ recent: _r, ts: _t, ...rest }) => rest);
}

export function detectSteamAccount(roots = steamRoots()): SteamAccount | null {
  for (const r of roots) {
    try {
      const list = parseLoginUsers(fs.readFileSync(path.join(r, 'config', 'loginusers.vdf'), 'utf8'));
      if (list.length) return list[0];
    } catch { /* nächster Pfad */ }
  }
  return null;
}

export function deadlockDir(roots = steamRoots()): string | null {
  for (const r of roots) {
    const libs = [r];
    try {
      const vdf = fs.readFileSync(path.join(r, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      libs.push(...[...vdf.matchAll(/"path"\s+"([^"]+)"/g)].map((x) => x[1].replace(/\\\\/g, '\\')));
    } catch { /* ignorieren */ }
    for (const l of libs) {
      const p = path.join(l, 'steamapps', 'common', 'Deadlock');
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

/** Prüft, ob Deadlock läuft (Windows: tasklist). */
export function isDeadlockRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false);
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 5000 }, (err, out) => {
      if (err) return resolve(false);
      resolve(/"(deadlock|project8)\.exe"/i.test(out));
    });
  });
}

/**
 * Heuristik: sucht eine Match-ID im Konsolenprotokoll des Spiels (nur vorhanden mit Startoption -condebug).
 * Das Format ist NICHT verifiziert; Treffer werden als „vermutet“ behandelt.
 */
export function matchIdFromConsoleLog(gameDir: string | null): string | null {
  if (!gameDir) return null;
  const p = path.join(gameDir, 'game', 'citadel', 'console.log');
  try {
    const stat = fs.statSync(p);
    const fd = fs.openSync(p, 'r');
    const len = Math.min(stat.size, 256 * 1024);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, stat.size - len);
    fs.closeSync(fd);
    const matches = [...buf.toString('utf8').matchAll(/match[ _-]?id\D{0,4}(\d{7,12})/gi)];
    return matches.length ? matches[matches.length - 1][1] : null;
  } catch { return null; }
}

/** Community-API: aktive Matches mit diesem Konto (nur ~200 meistgesehene Matches). */
export async function activeMatchFor(accountId: number, fetchImpl: typeof fetch = fetch, base = 'https://api.deadlock-api.com'): Promise<string | null> {
  const r = await fetchImpl(`${base}/v1/matches/active?account_ids=${accountId}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const list = (await r.json()) as { match_id?: number }[];
  return list[0]?.match_id ? String(list[0].match_id) : null;
}
