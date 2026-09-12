#!/usr/bin/env node
// Produktions-Start (z. B. auf Render/anderen PaaS): setzt einen Fallback für
// DATABASE_URL, falls die Umgebungsvariable im Hosting-Dashboard vergessen
// wurde, führt dann `prisma migrate deploy` aus und startet danach den
// Next.js-Server. Ohne diesen Fallback bricht der komplette Deploy mit
// "Environment variable not found: DATABASE_URL" ab, bevor überhaupt ein Port
// geöffnet wird - das ist die Fehlermeldung, die sonst nur ein anonymisierter
// "Digest"-Code auf der Fehlerseite verrät.
//
// Kein simulierter/gefakter Zustand: DATABASE_URL legt bei SQLite nur den
// lokalen Dateipfad der DB-Datei fest. "file:./dev.db" ist exakt der Wert aus
// .env.example - der Fallback verhindert lediglich, dass ein vergessenes
// Setzen dieser einen Variable die ganze App lahmlegt.
import { spawn } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.warn(
    '[craftboard] DATABASE_URL ist nicht gesetzt - verwende Standardwert "file:./dev.db". ' +
      "Für eine dauerhafte Produktivdatenbank diese Variable im Hosting-Dashboard setzen (siehe README, Abschnitt 'Deployment auf Render').",
  );
  process.env.DATABASE_URL = "file:./dev.db";
}

let current = null;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => current?.kill(signal));
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    current = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });
    current.on("exit", (code, signal) => {
      current = null;
      if (signal) return reject(new Error(`${command} wurde durch Signal ${signal} beendet.`));
      if (code !== 0) return reject(new Error(`${command} ${args.join(" ")} beendet mit Exit-Code ${code}.`));
      resolve();
    });
    current.on("error", reject);
  });
}

try {
  await run("npx", ["prisma", "migrate", "deploy"]);
  await run("npx", ["next", "start"]);
} catch (err) {
  console.error(`[craftboard] Start fehlgeschlagen: ${err.message}`);
  process.exit(1);
}
