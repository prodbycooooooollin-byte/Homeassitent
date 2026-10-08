// Baut Next.js (standalone) und legt statische Dateien neben den Standalone-Server.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// Replay-Worker als einzelne Datei bündeln (läuft später als eigener Prozess, ohne node_modules daneben)
run("npx", ["esbuild", "electron/replay-worker.mjs", "--bundle", "--platform=node", "--format=esm", "--target=node20",
  "--banner:js=import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);", "--outfile=electron/replay-worker.bundle.mjs", "--log-level=warning"]);

rmSync(join(root, ".next"), { recursive: true, force: true });
run("npx", ["next", "build"]);

const standalone = join(root, ".next", "standalone");
if (!existsSync(join(standalone, "server.js"))) {
  console.error("Standalone-Build fehlt (output: 'standalone' in next.config.mjs?)");
  process.exit(1);
}
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
if (existsSync(join(root, "public"))) cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
// Nie lokale Daten ins Installationspaket packen
rmSync(join(standalone, "data"), { recursive: true, force: true });
console.log("Desktop-Bundle bereit:", standalone);
