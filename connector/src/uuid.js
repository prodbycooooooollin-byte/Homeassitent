// Berechnet die "Offline-UUID" eines Spielers exakt wie es ein Vanilla-
// Minecraft-Server im Offline-Modus (online-mode=false) selbst tut:
// UUID.nameUUIDFromBytes(("OfflinePlayer:" + name).getBytes(UTF_8)).
// Für online-mode=true-Server wird stattdessen die echte UUID aus
// usercache.json verwendet (siehe statsReader.js) - diese Funktion ist nur
// der Fallback, wenn ein Spielername in keiner bekannten Quelle auftaucht.
import crypto from "node:crypto";

export function offlineUuidFor(username) {
  const md5 = crypto.createHash("md5").update(`OfflinePlayer:${username}`, "utf8").digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const hex = md5.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
