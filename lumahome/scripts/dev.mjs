// Startet Server (mit Neustart bei Änderungen) und Vite-Entwicklungsserver gemeinsam.
import { spawn } from "node:child_process";

const run = (cmd, args) => spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
const server = run("npx", ["tsx", "watch", "server/index.ts"]);
const web = run("npx", ["vite"]);
const stop = () => {
  server.kill();
  web.kill();
  process.exit();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
