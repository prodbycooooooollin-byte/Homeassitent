"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/state/app-context";

export function Sidebar() {
  const pathname = usePathname();
  const { settings, connectionStatus } = useApp();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface/60 backdrop-blur-xl lg:flex">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-strong shadow-glowAccent">
          <Icon name="zap" size={20} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{settings.houseName}</p>
          <p className="flex items-center gap-1 text-[0.7rem] text-ink-faint">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                connectionStatus === "connected" || connectionStatus === "demo" ? "bg-good" : "bg-bad",
              )}
            />
            {connectionStatus === "demo" ? "Demo-Modus" : connectionStatus === "connected" ? "Verbunden" : "Getrennt"}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Hauptnavigation">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                active
                  ? "bg-accent-soft text-accent-strong shadow-[inset_0_0_0_1px_rgba(61,139,253,0.25)]"
                  : "text-ink-muted hover:bg-surface-hover hover:text-ink",
              )}
            >
              <Icon
                name={item.icon}
                size={18}
                className={cn(active ? "text-accent-strong" : "text-ink-faint group-hover:text-ink-muted")}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line px-4 py-4">
        <div className="rounded-xl border border-line bg-surface-raised p-3 text-xs text-ink-muted">
          <p className="mb-1 font-medium text-ink">Smart-Home-Center</p>
          <p>Steuerung &amp; Überwachung deines Zuhauses.</p>
        </div>
      </div>
    </aside>
  );
}
