import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Verschlüsselt Zugangsdaten (z. B. das RCON-Passwort), die in der DB
// abgelegt werden müssen, damit der Einrichtungsassistent sie über die UI
// verwalten kann. Verwendet AES-256-GCM. Der Schlüssel kommt aus
// CREDENTIALS_ENCRYPTION_KEY (empfohlen für Produktion); ist die Variable
// nicht gesetzt, wird beim ersten Start einmalig ein zufälliger Schlüssel
// erzeugt und lokal unter storage/credentials.key abgelegt (siehe
// .gitignore - diese Datei darf NIE eingecheckt werden). Ohne diesen
// Schlüssel können zuvor verschlüsselte Werte nicht mehr entschlüsselt
// werden - ein Neustart mit fehlendem Schlüssel macht gespeicherte
// RCON-Passwörter also ungültig (Admin müsste sie neu eingeben).

const STORAGE_DIR = process.env.STORAGE_DIR || "./storage";
const KEY_FILE = path.join(STORAGE_DIR, "credentials.key");

let cachedKey: Buffer | null = null;

function loadOrCreateKey(): Buffer {
  if (cachedKey) return cachedKey;

  const fromEnv = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (fromEnv) {
    cachedKey = Buffer.from(fromEnv, "hex");
    if (cachedKey.length !== 32) {
      throw new Error("CREDENTIALS_ENCRYPTION_KEY muss 32 Bytes (64 Hex-Zeichen) lang sein.");
    }
    return cachedKey;
  }

  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  if (fs.existsSync(KEY_FILE)) {
    cachedKey = Buffer.from(fs.readFileSync(KEY_FILE, "utf8").trim(), "hex");
    return cachedKey;
  }

  const generated = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, generated.toString("hex"), { mode: 0o600 });
  console.warn(
    `[craftboard] Kein CREDENTIALS_ENCRYPTION_KEY gesetzt - ein zufälliger Schlüssel wurde unter ${KEY_FILE} erzeugt. ` +
      "Für Produktion empfohlen: Schlüssel in CREDENTIALS_ENCRYPTION_KEY setzen und sichern.",
  );
  cachedKey = generated;
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const key = loadOrCreateKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string): string {
  const key = loadOrCreateKey();
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Ungültiges verschlüsseltes Format.");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
