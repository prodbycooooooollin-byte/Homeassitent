import { Compass, Crosshair, Egg, Home, Lock, Map, Bookmark, ScanLine, Search, Wallet } from "lucide-react";

export const MODULES = [
  { href: "/scan", label: "Intel Scan", short: "Scan", icon: ScanLine, blurb: "Identify anything from a screenshot", scene: "highway", seed: 202 },
  { href: "/missions", label: "Mission Solver", short: "Missions", icon: Crosshair, blurb: "Focused help for the objective you're stuck on", scene: "harbor", seed: 101 },
  { href: "/unlocks", label: "Unlocks", short: "Unlocks", icon: Lock, blurb: "How to unlock vehicles, weapons, gear and more", scene: "garage", seed: 213 },
  { href: "/easter-eggs", label: "Easter Eggs", short: "Secrets", icon: Egg, blurb: "Secrets, mysteries and hidden places", scene: "swamp", seed: 301 },
  { href: "/money", label: "Money Intel", short: "Money", icon: Wallet, blurb: "Compare ways to earn in-game cash", scene: "vault", seed: 405 },
] as const;

export const DESKTOP_NAV = [
  { href: "/missions", label: "Missions" },
  { href: "/unlocks", label: "Unlocks" },
  { href: "/easter-eggs", label: "Easter Eggs" },
  { href: "/money", label: "Money" },
  { href: "/map", label: "Map" },
];

export const MOBILE_NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/scan", label: "Scan", icon: ScanLine, primary: true },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/saved", label: "Saved", icon: Bookmark },
];

export const MAP_ICON = Map;
