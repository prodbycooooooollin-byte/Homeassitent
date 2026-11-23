import type { EntityKind, VerificationStatus } from "@/lib/content/schema";

export const STATUS_META: Record<
  VerificationStatus,
  { label: string; short: string; description: string; text: string; bg: string; border: string; dot: string }
> = {
  verified: {
    label: "Verified",
    short: "Verified",
    description: "Confirmed in the released game by VICE INTEL editors, with sources.",
    text: "text-status-verified",
    bg: "bg-status-verified/10",
    border: "border-status-verified/30",
    dot: "bg-status-verified",
  },
  official: {
    label: "Official info",
    short: "Official",
    description: "From Rockstar's official pre-release material. In-game details may differ.",
    text: "text-status-official",
    bg: "bg-status-official/10",
    border: "border-status-official/30",
    dot: "bg-status-official",
  },
  estimate: {
    label: "Estimate",
    short: "Estimate",
    description: "A measured or calculated value — treat as approximate.",
    text: "text-status-estimate",
    bg: "bg-status-estimate/10",
    border: "border-status-estimate/30",
    dot: "bg-status-estimate",
  },
  theory: {
    label: "Theory",
    short: "Theory",
    description: "A community theory. Plausible, not confirmed.",
    text: "text-status-theory",
    bg: "bg-status-theory/10",
    border: "border-status-theory/30",
    dot: "bg-status-theory",
  },
  unverified: {
    label: "Unverified claim",
    short: "Unverified",
    description: "Reported by the community but not reproduced yet.",
    text: "text-status-unverified",
    bg: "bg-status-unverified/10",
    border: "border-status-unverified/30",
    dot: "bg-status-unverified",
  },
  demo: {
    label: "Demo data",
    short: "Demo",
    description: "Sample content that demonstrates the product. Not real GTA VI information.",
    text: "text-status-demo",
    bg: "bg-status-demo/10",
    border: "border-status-demo/30",
    dot: "bg-status-demo",
  },
  unknown: {
    label: "Unknown",
    short: "Unknown",
    description: "Nothing reliable is known yet.",
    text: "text-status-unknown",
    bg: "bg-status-unknown/10",
    border: "border-status-unknown/30",
    dot: "bg-status-unknown",
  },
};

export const KIND_META: Record<EntityKind, { label: string; plural: string; href: string }> = {
  mission: { label: "Mission", plural: "Missions", href: "/missions" },
  unlock: { label: "Unlock", plural: "Unlocks", href: "/unlocks" },
  "easter-egg": { label: "Easter Egg", plural: "Easter Eggs", href: "/easter-eggs" },
  money: { label: "Money", plural: "Money Intel", href: "/money" },
  location: { label: "Location", plural: "Locations", href: "/map" },
  character: { label: "Character", plural: "Characters", href: "/explore" },
};

export function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1000)}K`;
  return `$${n.toLocaleString("en-US")}`;
}

export function artUrl(scene: string, seed: number): string {
  return `/art/${scene}/${seed}`;
}
