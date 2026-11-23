"use client";
import { Thumb } from "@/components/ui/Thumb";
import Link from "next/link";
import { History, X } from "lucide-react";
import { actions, useStore } from "@/lib/client/store";

export function RecentlyViewed() {
  const recents = useStore((s) => s.recents);
  if (recents.length === 0) return null;
  return (
    <section className="container-page mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="h-display flex items-center gap-2 text-lg">
          <History className="h-4 w-4 text-violet-400" /> Pick up where you left off
        </h2>
        <button type="button" onClick={actions.clearRecents} className="inline-flex items-center gap-1 text-xs text-fg-faint hover:text-fg">
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      </div>
      <ul className="mask-fade-x scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
        {recents.map((r) => (
          <li key={r.id} className="snap-start">
            <Link href={r.href} className="group surface flex w-56 items-center gap-3 p-2 pr-3 hover:border-violet-500/30">
              <span className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-700">
                <Thumb src={r.src} art={r.art} className="h-full w-full" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{r.title}</span>
                <span className="block truncate text-xs capitalize text-fg-faint">{r.kind.replace("-", " ")}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
