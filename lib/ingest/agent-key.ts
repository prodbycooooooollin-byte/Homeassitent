import "server-only";
import crypto from "node:crypto";

const PREFIX = "cba_"; // "craftboard agent"

export function generateAgentKey(): { plaintext: string; hash: string } {
  const plaintext = PREFIX + crypto.randomBytes(24).toString("base64url");
  return { plaintext, hash: hashAgentKey(plaintext) };
}

export function hashAgentKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

export function verifyAgentKey(plaintext: string, hash: string): boolean {
  const candidate = Buffer.from(hashAgentKey(plaintext));
  const expected = Buffer.from(hash);
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}
