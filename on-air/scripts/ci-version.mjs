// Automatische Release-Version im CI: <major>.<minor> aus tauri.conf.json, Patch = Laufnummer.
// Tag-Builds (on-air-vX.Y.Z) behalten die Version aus dem Tag.
// Aufruf: node scripts/ci-version.mjs   → schreibt version=… und channel=… nach $GITHUB_OUTPUT
import { readFileSync, appendFileSync } from "node:fs";

const ref = process.env.GITHUB_REF ?? "";
const run = process.env.GITHUB_RUN_NUMBER;
let version;
const tag = /^refs\/tags\/on-air-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)$/.exec(ref);
if (tag) {
  version = tag[1];
} else {
  const base = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
  const m = /^(\d+)\.(\d+)\./.exec(base);
  if (!m || !run) {
    console.error(`Version nicht bestimmbar (Basis ${base}, Lauf ${run})`);
    process.exit(1);
  }
  version = `${m[1]}.${m[2]}.${run}`;
}
const channel = version.includes("-") ? "prerelease" : "stable";
console.log(`Version ${version} (${channel})`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nchannel=${channel}\n`);
