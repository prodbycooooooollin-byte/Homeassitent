// Erzeugt das Update-Manifest (latest.json).
// Aufruf: node scripts/make-latest-json.mjs <version> <tag> <repo> <nsis.exe> [msi] [notes.md]
//
// Pro Paket: url, sha256, size (direkter Update-Pfad ohne eigenen Schlüssel) und – falls das
// Release signiert gebaut wurde – signature (Tauri-Updater mit eingebettetem Schlüssel).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const [version, tag, repo, nsis, msi, notesFile] = process.argv.slice(2);
const base = `https://github.com/${repo}/releases/download/${tag}`;
const entry = (file) => {
  if (!existsSync(file)) throw new Error(`Artefakt fehlt: ${file}`);
  const bytes = readFileSync(file);
  const e = {
    url: `${base}/${encodeURIComponent(basename(file))}`,
    signature: existsSync(`${file}.sig`) ? readFileSync(`${file}.sig`, "utf8").trim() : "",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: statSync(file).size,
  };
  if (!e.size) throw new Error(`Leeres Artefakt: ${file}`);
  return e;
};
let notes = "";
if (notesFile && existsSync(notesFile)) notes = readFileSync(notesFile, "utf8").trim();
const nsisEntry = entry(nsis);
const platforms = {
  // NSIS-Installationen (Standard, Benutzerbereich) aktualisieren mit dem NSIS-Paket,
  // MSI-Installationen mit dem MSI-Paket – kein ungeplanter Wechsel des Installationsumfangs.
  "windows-x86_64-nsis": nsisEntry,
  "windows-x86_64": nsisEntry,
};
if (msi && existsSync(msi)) platforms["windows-x86_64-msi"] = entry(msi);
const manifest = { version, notes: notes || `ON AIR ${version}`, pub_date: new Date().toISOString(), platforms };
writeFileSync("latest.json", JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
