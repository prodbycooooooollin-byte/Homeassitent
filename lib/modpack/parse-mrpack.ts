import "server-only";
import AdmZip from "adm-zip";

export interface MrpackIndex {
  formatVersion: number;
  game: string;
  versionId: string;
  name: string;
  dependencies: Record<string, string>; // z. B. { minecraft: "1.20.1", "fabric-loader": "0.15.11" }
  files: { path: string; downloads: string[] }[];
}

export interface ParsedModEntry {
  name: string;
  fileName: string;
}

/**
 * Liest eine .mrpack-Datei (ein normales ZIP mit modrinth.index.json) und
 * leitet daraus eine Modliste ab. Modrinth speichert dort keine
 * "menschenlesbaren" Modnamen, nur Dateipfade - der Name wird daher
 * bestmöglich aus dem Dateinamen rekonstruiert (Versionsnummer/Hash
 * abgeschnitten). Schlägt das Parsen fehl (kein gültiges .mrpack), wird ein
 * Fehler geworfen statt stillschweigend eine leere/erfundene Liste
 * zurückzugeben.
 */
export function parseMrpack(buffer: Buffer): { index: MrpackIndex; mods: ParsedModEntry[] } {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("modrinth.index.json");
  if (!entry) {
    throw new Error("Keine gültige .mrpack-Datei (modrinth.index.json fehlt).");
  }
  const raw = JSON.parse(entry.getData().toString("utf8"));
  const index: MrpackIndex = {
    formatVersion: raw.formatVersion,
    game: raw.game,
    versionId: raw.versionId,
    name: raw.name,
    dependencies: raw.dependencies ?? {},
    files: raw.files ?? [],
  };

  const mods: ParsedModEntry[] = index.files
    .filter((f) => f.path.startsWith("mods/") && f.path.endsWith(".jar"))
    .map((f) => {
      const fileName = f.path.split("/").pop() ?? f.path;
      return { fileName, name: humanizeModFileName(fileName) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { index, mods };
}

/**
 * Leitet aus einem Jar-Dateinamen einen lesbaren Namen ab, indem
 * Versions-Tokens (z. B. "0.5.8", "v2", "mc1.20.1") vom Ende her entfernt
 * werden. Bewusst KEIN Versuch, Loader-Suffixe wie "-fabric" zu erraten -
 * das würde bei Namen wie "fabric-api" falsche Ergebnisse liefern. Im
 * Zweifel bleibt der Name etwas länger statt falsch gekürzt zu werden.
 */
function humanizeModFileName(fileName: string): string {
  const base = fileName.replace(/\.jar$/i, "");
  const tokens = base.split(/[-_]+/).filter(Boolean);
  const looksLikeVersion = (t: string) => /^v?\d/.test(t) || /^mc\d/i.test(t);

  const kept: string[] = [];
  for (const token of tokens) {
    if (looksLikeVersion(token)) break;
    kept.push(token);
  }

  const name = (kept.length ? kept : tokens).join(" ").trim();
  return name || base;
}
