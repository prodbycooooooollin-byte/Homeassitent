import type { RoleKey } from "./types";

/**
 * Vorwissen zur Rolle eines Helden. Quelle in dieser Reihenfolge:
 *  1. `description.role` aus den Spieldaten der Assets-API (Freitext, per Stichwort zugeordnet)
 *  2. kuratierte Liste klar unterstützender Helden (nur wenn die Spieldaten nichts liefern)
 * Das ist nur ein Vorwissen: Das tatsächliche Spielverhalten kann es überstimmen (siehe rating.ts).
 */
export const CURATED = new Set(["paige", "dynamo", "ivy", "kelvin"]);

/** Feste Rolle je Held (Spielstand: Heldenliste 2025). Die Rolle ist eine Eigenschaft des HELDEN, nicht davon, wie gut oder schlecht du gespielt hast. */
export const ROSTER: Record<string, RoleKey> = {
  // Damage-Dealer / Carries
  haze: "carry", infernus: "carry", vindicta: "carry", "lady geist": "carry", "grey talon": "carry", holliday: "carry", pocket: "carry",
  seven: "carry", calico: "carry", vyper: "carry", yamato: "carry", wraith: "carry", mirage: "carry", paradox: "carry", mcginnis: "carry",
  shiv: "carry", lash: "carry", drifter: "carry", victor: "carry", graves: "carry", silver: "carry", venator: "carry", "the doorman": "carry", apollo: "carry",
  // Frontline
  abrams: "tank", "mo & krill": "tank", "mo and krill": "tank", billy: "tank", bebop: "tank", warden: "tank", viscous: "tank",
  // Support
  dynamo: "support", ivy: "support", kelvin: "support", paige: "support", sinclair: "support", rem: "support",
};

/** Rolle eines Helden: feste Liste zuerst, dann Heldentyp aus den Spieldaten, erst zuletzt (streng) der Freitext. */
export function heroRole(name?: string | null, type?: string | null, roleText?: string | null): RoleKey | null {
  const n = name?.toLowerCase().trim();
  if (n && ROSTER[n]) return ROSTER[n];
  const t = type?.toLowerCase() ?? "";
  if (/assassin|marksman/.test(t)) return "carry";
  if (/brawler/.test(t)) return "tank";
  return roleFromText(roleText);
}

export function roleFromText(text?: string | null): RoleKey | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\bsupport\b|\bheal(er|ing)?\b/.test(t)) return "support";
  if (/\btank\b|frontline|bruiser/.test(t)) return "tank";
  if (/carry|damage|dps|burst|assassin|marksman|ranged|sniper/.test(t)) return "carry";
  return null;
}

export type HeroRoleProvider = (heroId: number) => RoleKey | null;


