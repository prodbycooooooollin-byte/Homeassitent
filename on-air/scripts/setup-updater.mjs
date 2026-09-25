// OPTIONAL: zusätzliche Signaturprüfung für Updates einrichten (Updates funktionieren auch ohne,
// dann prüft die App Herkunft und SHA-256). Auf DEINEM Rechner ausführen:
//
//   cd on-air
//   node scripts/setup-updater.mjs
//
// 1. Erzeugt ein Signatur-Schlüsselpaar unter ~/.tauri/onair.key(.pub) – ein vorhandener
//    Schlüssel wird wiederverwendet, nie überschrieben.
// 2. Hinterlegt mit der GitHub-CLI (`gh`, angemeldet) im Repository:
//      Secret   TAURI_SIGNING_PRIVATE_KEY           (Inhalt des privaten Schlüssels)
//      Secret   TAURI_SIGNING_PRIVATE_KEY_PASSWORD  (Passwort)
//      Variable ONAIR_UPDATER_PUBKEY                 (öffentlicher Schlüssel)
//    Geheimnisse gehen per Standardeingabe an `gh`, nicht über die Kommandozeile oder Logs.
// Ohne `gh` zeigt das Skript die Werte-Quellen für die manuelle Eingabe auf github.com.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const REPO = process.env.ONAIR_REPO ?? "prodbycooooooollin-byte/Homeassitent";
const dir = join(homedir(), ".tauri");
const keyPath = join(dir, "onair.key");
const pubPath = `${keyPath}.pub`;
const win = process.platform === "win32";

// Verdeckte Eingabe; verarbeitet auch eingefügte Passwörter (mehrere Zeichen pro Block).
let pending = "";
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = "";
    const finish = (rest) => {
      stdin.setRawMode?.(false);
      stdin.pause();
      stdin.off("data", onData);
      pending = rest;
      process.stdout.write("\n");
      resolve(value);
    };
    const feed = (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          const rest = chunk.slice(i + 1).replace(/^\n/, "");
          finish(rest);
          return true;
        }
        if (ch === "\u0003") {
          process.stdout.write("\nAbgebrochen.\n");
          process.exit(1);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
      return false;
    };
    const onData = (chunk) => void feed(chunk);
    if (pending) {
      const p = pending;
      pending = "";
      if (feed(p)) return;
    }
    stdin.setRawMode?.(true);
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
    stdin.resume();
  });
}

function hasGh() {
  const r = spawnSync("gh", ["auth", "status"], { stdio: "ignore", shell: win });
  return r.status === 0;
}

function gh(args, input) {
  execFileSync("gh", args, { input, stdio: ["pipe", "inherit", "inherit"], shell: win });
}

console.log("ON AIR – Einrichtung signierter Updates\n");

let password;
if (existsSync(keyPath) && existsSync(pubPath)) {
  console.log(`Vorhandener Schlüssel wird verwendet: ${keyPath}`);
  password = await askHidden("Passwort dieses Schlüssels: ");
} else {
  mkdirSync(dir, { recursive: true });
  for (;;) {
    password = await askHidden("Neues Passwort für den Signaturschlüssel (mind. 8 Zeichen): ");
    const again = await askHidden("Passwort wiederholen: ");
    if (password.length < 8) console.log("Zu kurz.");
    else if (password !== again) console.log("Stimmt nicht überein.");
    else break;
  }
  const r = spawnSync("npx", ["tauri", "signer", "generate", "--ci", "-w", keyPath, "-p", password], { stdio: ["ignore", "ignore", "inherit"], shell: win });
  if (r.status !== 0 || !existsSync(keyPath)) {
    console.error("Schlüssel konnte nicht erzeugt werden.");
    process.exit(1);
  }
  console.log(`Schlüssel erzeugt: ${keyPath}`);
}

const privateKey = readFileSync(keyPath, "utf8").trim();
const publicKey = readFileSync(pubPath, "utf8").trim();

if (!hasGh()) {
  console.log(`
GitHub-CLI (gh) nicht gefunden oder nicht angemeldet. Bitte manuell eintragen unter
https://github.com/${REPO}/settings/secrets/actions

  Secret   TAURI_SIGNING_PRIVATE_KEY           = Inhalt von ${keyPath}
  Secret   TAURI_SIGNING_PRIVATE_KEY_PASSWORD  = dein Passwort
  Variable ONAIR_UPDATER_PUBKEY (Reiter „Variables“) = Inhalt von ${pubPath}
`);
} else {
  gh(["secret", "set", "TAURI_SIGNING_PRIVATE_KEY", "--repo", REPO], privateKey);
  gh(["secret", "set", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD", "--repo", REPO], password);
  gh(["variable", "set", "ONAIR_UPDATER_PUBKEY", "--repo", REPO, "--body", publicKey]);
  console.log(`\nSecrets und Variable in ${REPO} hinterlegt.`);
}

console.log(`
WICHTIG: ${keyPath} und das Passwort sicher aufbewahren (z. B. Passwortmanager).
Ohne diesen Schlüssel können installierte Versionen keine Updates mehr annehmen.

Ab dem nächsten Push werden Releases automatisch signiert.
Apps aus diesen Releases verlangen danach Signaturen – den Schlüssel also nicht verlieren.
`);
