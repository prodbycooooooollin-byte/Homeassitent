// Baut den eigenen Installer (installer-app) als einzelne EXE nach release/Lockscope-Installer.exe.
// Der Installer lädt zur Laufzeit das aktuelle Installationspaket aus dem Update-Release – er muss also nicht bei jeder Version neu gebaut werden.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const electronVersion = require("electron/package.json").version;
const extra = process.argv.slice(2);
const r = spawnSync(process.execPath, [join(root, "node_modules", "electron-builder", "cli.js"), "--win", "portable", "--publish", "never", `-c.electronVersion=${electronVersion}`, ...extra], {
  cwd: join(root, "installer-app"), stdio: "inherit",
});
process.exit(r.status ?? 1);
