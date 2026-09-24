// Prüft, ob Tag, package.json, tauri.conf.json und Cargo-Workspace dieselbe Version tragen.
// Aufruf: node scripts/check-version.mjs on-air-v0.2.0   → gibt Version und Kanal aus.
import { readFileSync, appendFileSync } from "node:fs";

const tag = process.argv[2] ?? "";
const m = /^on-air-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)$/.exec(tag);
if (!m) {
  console.error(`Ungültiges Tag „${tag}“ – erwartet z. B. on-air-v0.2.1 oder on-air-v0.3.0-beta.1`);
  process.exit(1);
}
const version = m[1];
const pkg = JSON.parse(readFileSync("package.json", "utf8")).version;
const tauri = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
const cargo = /\[workspace\.package\][^[]*?version\s*=\s*"([^"]+)"/s.exec(readFileSync("Cargo.toml", "utf8"))?.[1];
const bad = Object.entries({ "package.json": pkg, "tauri.conf.json": tauri, "Cargo.toml": cargo }).filter(([, v]) => v !== version);
if (bad.length) {
  console.error(`Versionskonflikt: Tag ${version}, abweichend: ${bad.map(([f, v]) => `${f}=${v}`).join(", ")}`);
  console.error("Mit `node scripts/set-version.mjs <version>` alle Dateien angleichen und neu taggen.");
  process.exit(1);
}
const channel = version.includes("-") ? "prerelease" : "stable";
console.log(`Version ${version} (${channel})`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nchannel=${channel}\n`);
