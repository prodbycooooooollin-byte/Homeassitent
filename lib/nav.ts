import {
  LayoutDashboard,
  Users,
  BarChart3,
  Map,
  Hammer,
  Package,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Übersicht", icon: LayoutDashboard },
  { href: "/spieler", label: "Spieler", icon: Users },
  { href: "/statistiken", label: "Statistiken", icon: BarChart3 },
  { href: "/karte", label: "Weltkarte", icon: Map },
  { href: "/projekte", label: "Projekte", icon: Hammer },
  { href: "/modpack", label: "Modpack", icon: Package },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
];
