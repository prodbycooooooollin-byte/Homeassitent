// Setzt die Version in package.json, package-lock.json, tauri.conf.json und Cargo.toml.
// Aufruf: node scripts/set-version.mjs 0.2.1
import { readFileSync, writeFileSync } from "node:fs";

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(v ?? "")) {
  console.error("Aufruf: node scripts/set-version.mjs <major.minor.patch[-pre]>");
  process.exit(1);
}
const json = (f, fn) => {
  const o = JSON.parse(readFileSync(f, "utf8"));
  fn(o);
  writeFileSync(f, JSON.stringify(o, null, 2) + "\n");
};
json("package.json", (o) => (o.version = v));
json("package-lock.json", (o) => {
  o.version = v;
  if (o.packages?.[""]) o.packages[""].version = v;
});
json("src-tauri/tauri.conf.json", (o) => (o.version = v));
const cargo = readFileSync("Cargo.toml", "utf8").replace(/(\[workspace\.package\][^[]*?version\s*=\s*")[^"]+(")/s, `$1${v}$2`);
writeFileSync("Cargo.toml", cargo);
console.log(`Version auf ${v} gesetzt. Danach: cargo update -w, CHANGELOG ergänzen, committen, Tag on-air-v${v} pushen.`);
