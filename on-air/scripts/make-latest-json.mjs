// Erzeugt das Update-Manifest (latest.json) für den Tauri-Updater.
// Aufruf: node scripts/make-latest-json.mjs <version> <tag> <repo> <nsis.exe> <msi>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename } from "node:path";

const [version, tag, repo, nsis, msi] = process.argv.slice(2);
const base = `https://github.com/${repo}/releases/download/${tag}`;
const entry = (file) => {
  if (!existsSync(file) || !existsSync(`${file}.sig`)) throw new Error(`Artefakt oder Signatur fehlt: ${file}`);
  const signature = readFileSync(`${file}.sig`, "utf8").trim();
  if (!signature) throw new Error(`Leere Signatur: ${file}.sig`);
  return { url: `${base}/${encodeURIComponent(basename(file))}`, signature };
};
// Release Notes aus CHANGELOG.md (Abschnitt „## <version>“).
let notes = "";
try {
  const log = readFileSync("CHANGELOG.md", "utf8");
  const m = new RegExp(`^## ${version.replace(/\./g, "\\.")}\\b[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m").exec(log);
  notes = (m?.[1] ?? "").trim();
} catch {}
const nsisEntry = entry(nsis);
const manifest = {
  version,
  notes: notes || `ON AIR ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    // Bestehende NSIS-Installationen (Standard, Benutzerbereich) bleiben bei NSIS,
    // MSI-Installationen bei MSI – kein ungeplanter Wechsel des Installationsumfangs.
    "windows-x86_64-nsis": nsisEntry,
    "windows-x86_64-msi": entry(msi),
    "windows-x86_64": nsisEntry,
  },
};
writeFileSync("latest.json", JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
