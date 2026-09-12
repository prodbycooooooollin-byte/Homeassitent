import Link from "next/link";
import { Wifi, WifiOff, Cable } from "lucide-react";
import type { ConnectionLevel } from "@/lib/server-context";
import { cn } from "@/lib/cn";

const CONFIG: Record<
  ConnectionLevel,
  { label: string; icon: typeof Wifi; className: string }
> = {
  none: {
    label: "Kein Server eingerichtet",
    icon: WifiOff,
    className: "text-ink-faint bg-surface-raised border-line",
  },
  basic: {
    label: "Basis-Statusabfrage aktiv",
    icon: Wifi,
    className: "text-info bg-info-soft border-info/30",
  },
  full: {
    label: "Vollständig verbunden",
    icon: Cable,
    className: "text-accent bg-accent-soft border-accent/30",
  },
};

export function ConnectionIndicator({ level }: { level: ConnectionLevel }) {
  const { label, icon: Icon, className } = CONFIG[level];
  return (
    <Link
      href="/einstellungen"
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-opacity hover:opacity-80",
        className,
      )}
      title={label}
    >
      <Icon size={13} />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
