// Copies static assets into the Next.js standalone bundle so Electron can ship it as-is.
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const standalone = path.join(root, ".next", "standalone");
if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("Missing .next/standalone/server.js — run `next build` first.");
  process.exit(1);
}
const copy = (from, to) => {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
};
copy(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
copy(path.join(root, "public"), path.join(standalone, "public"));
console.log("Desktop bundle ready:", standalone);
