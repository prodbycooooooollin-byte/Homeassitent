// Einfache, nachvollziehbare Berechtigungen für den lokalen Betrieb.
//
//   keine PIN gesetzt         → alle im erreichbaren Netz dürfen betrachten, steuern und bearbeiten
//   LUMAHOME_VIEW_PIN gesetzt → Betrachten/Steuern erfordert die PIN
//   LUMAHOME_EDIT_PIN gesetzt → Bearbeiten (Grundriss, Einrichtung, Zuordnungen,
//                               Messquellen) erfordert die Bearbeitungs-PIN
//
// Sitzungen werden als HMAC-signiertes Cookie (SameSite=Strict, HttpOnly)
// gespeichert. Ändernde Anfragen müssen zusätzlich den Kopf X-LumaHome tragen.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage } from "node:http";
import { config } from "./config";

export type Role = "none" | "view" | "edit";

const SESSION_DAYS = 30;
let secret: Buffer | null = null;

function getSecret(): Buffer {
  if (secret) return secret;
  mkdirSync(config.dataDir, { recursive: true });
  const file = join(config.dataDir, ".session-secret");
  if (existsSync(file)) secret = Buffer.from(readFileSync(file, "utf8").trim(), "hex");
  else {
    secret = randomBytes(32);
    writeFileSync(file, secret.toString("hex"), { mode: 0o600 });
  }
  return secret;
}

const sign = (payload: string) => createHmac("sha256", getSecret()).update(payload).digest("hex");

export function issueSession(role: Exclude<Role, "none">): string {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const payload = `${role}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionRole(req: IncomingMessage): Role {
  const raw = parseCookies(req)["lh_session"];
  if (!raw) return "none";
  const [role, exp, sig] = raw.split(".");
  if (!role || !exp || !sig) return "none";
  const expected = sign(`${role}.${exp}`);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return "none";
  if (Number(exp) < Date.now()) return "none";
  return role === "edit" ? "edit" : role === "view" ? "view" : "none";
}

/** Effektive Rolle einer Anfrage unter Berücksichtigung der gesetzten PINs. */
export function roleOf(req: IncomingMessage): Role {
  const s = sessionRole(req);
  if (!config.viewPin && !config.editPin) return "edit";
  if (config.editPin) {
    if (s === "edit") return "edit";
    if (config.viewPin) return s === "view" ? "view" : "none";
    return "view";
  }
  // Nur VIEW_PIN gesetzt: wer betrachten darf, darf auch bearbeiten
  return s === "view" || s === "edit" ? "edit" : "none";
}

const attempts = new Map<string, { count: number; reset: number }>();

export function checkPin(ip: string, pin: string): Exclude<Role, "none"> | "rate_limited" | null {
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.reset > now && a.count >= 5) return "rate_limited";
  const eq = (x: string | null) => !!x && x.length === pin.length && timingSafeEqual(Buffer.from(x), Buffer.from(pin));
  if (eq(config.editPin)) return "edit";
  if (eq(config.viewPin)) return "view";
  const entry = a && a.reset > now ? a : { count: 0, reset: now + 60_000 };
  entry.count++;
  attempts.set(ip, entry);
  return null;
}

export function sessionCookie(value: string | null): string {
  if (!value) return "lh_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
  return `lh_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
}
