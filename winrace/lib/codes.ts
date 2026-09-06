import crypto from "node:crypto";
import bcrypt from "bcryptjs";

// Alphabet ohne leicht verwechselbare Zeichen (0/O, 1/I/L) – für Raumcodes,
// die Menschen laut vorlesen oder abtippen.
const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Erzeugt einen Raumcode im Format "WR-XXXXXX". */
export function generateRoomCode(): string {
  const bytes = crypto.randomBytes(6);
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  }
  return `WR-${suffix}`;
}

/**
 * Erzeugt ein kryptografisch sicheres, opakes Token (für Einladungen und
 * Overlay-Zugriffe). Nur der SHA-256-Hash wird persistiert – das Klartext-
 * Token wird dem Host genau einmal angezeigt, analog zu Personal-Access-
 * Tokens. Selbst ein DB-Leak liefert damit keine gültigen Tokens.
 */
export function generateOpaqueToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashOpaqueToken(token) };
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const BCRYPT_ROUNDS = 12;

export async function hashSecret(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, BCRYPT_ROUNDS);
}

export async function verifySecret(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

/** Konstante-Zeit-Vergleich für Tokens, um Timing-Angriffe zu erschweren. */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
