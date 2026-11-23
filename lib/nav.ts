export interface NavItem {
  href: string;
  label: string;
  icon: string;
  primaryMobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "home", primaryMobile: true },
  { href: "/energie", label: "Energie", icon: "zap", primaryMobile: true },
  { href: "/klima", label: "Klima", icon: "thermometer", primaryMobile: true },
  { href: "/geraete", label: "Geräte", icon: "plug-zap", primaryMobile: true },
  { href: "/raeume", label: "Räume", icon: "layout-grid" },
  { href: "/automationen", label: "Automationen", icon: "workflow" },
  { href: "/sicherheit", label: "Sicherheit", icon: "shield" },
  { href: "/einstellungen", label: "Einstellungen", icon: "settings" },
];
