"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  key: string;
  label: string;
  href: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export function Tabs({ items, active }: { items: TabItem[]; active: string }) {
  return (
    <nav aria-label="Bereich" className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-base-border pb-px">
      {items
        .filter((i) => !i.disabled)
        .map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                isActive ? "border-brand text-ink" : "border-transparent text-ink-faint hover:text-ink-muted"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
    </nav>
  );
}
