"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { Icon } from "@/components/ui/icon";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/cn";

const primaryItems = NAV_ITEMS.filter((i) => i.primaryMobile);
const moreItems = NAV_ITEMS.filter((i) => !i.primaryMobile);

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreItems.some((i) => pathname.startsWith(i.href));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/90 backdrop-blur-xl safe-bottom lg:hidden"
        aria-label="Hauptnavigation"
      >
        {primaryItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
            >
              <Icon name={item.icon} size={22} className={active ? "text-accent-strong" : "text-ink-faint"} />
              <span className={cn("text-[0.65rem] font-medium", active ? "text-accent-strong" : "text-ink-faint")}>
                {item.label}
              </span>
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <Icon name="more-horizontal" size={22} className={moreActive ? "text-accent-strong" : "text-ink-faint"} />
          <span className={cn("text-[0.65rem] font-medium", moreActive ? "text-accent-strong" : "text-ink-faint")}>
            Mehr
          </span>
        </button>
      </nav>

      <BottomSheet open={moreOpen} title="Weitere Bereiche" onClose={() => setMoreOpen(false)}>
        <div className="grid grid-cols-2 gap-3">
          {moreItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMoreOpen(false)}
              className="flex min-h-[6rem] flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface p-4 text-center hover:bg-surface-hover"
            >
              <Icon name={item.icon} size={22} className="text-accent-strong" />
              <span className="text-sm font-medium text-ink">{item.label}</span>
            </Link>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
