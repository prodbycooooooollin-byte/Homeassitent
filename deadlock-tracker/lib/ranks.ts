export const TIER_NAMES = [
  "Obscurus",
  "Initiate",
  "Seeker",
  "Alchemist",
  "Arcanist",
  "Ritualist",
  "Emissary",
  "Archon",
  "Oracle",
  "Phantom",
  "Ascendant",
  "Eternus",
] as const;

/** Badge-Code (Tier*10 + Subtier 1-6) -> linearer Wert (Tier*6 + Subtier). */
export function badgeToLinear(badge: number | null | undefined): number | null {
  if (!badge || badge <= 0) return null;
  const tier = Math.floor(badge / 10);
  const sub = badge % 10;
  if (tier < 1 || tier > 11 || sub < 1 || sub > 6) return null;
  return tier * 6 + sub;
}

export function linearToBadge(linear: number): number {
  const rounded = Math.round(linear);
  let tier = Math.floor((rounded - 1) / 6);
  let sub = rounded - tier * 6;
  tier = Math.min(11, Math.max(1, tier));
  sub = Math.min(6, Math.max(1, sub));
  return tier * 10 + sub;
}

/** Mittelwert über Badges (nulls werden ignoriert) -> Badge-Code oder null. */
export function averageBadge(badges: (number | null | undefined)[]): number | null {
  const lin = badges.map(badgeToLinear).filter((v): v is number => v !== null);
  if (!lin.length) return null;
  return linearToBadge(lin.reduce((a, b) => a + b, 0) / lin.length);
}

export function formatBadge(badge: number | null | undefined): string {
  if (!badge) return "Unbekannt";
  const tier = Math.floor(badge / 10);
  const sub = badge % 10;
  const name = TIER_NAMES[tier];
  if (!name) return "Unbekannt";
  return tier === 0 ? name : `${name} ${sub}`;
}

export function tierOf(badge: number | null | undefined): number {
  return badge ? Math.floor(badge / 10) : 0;
}
