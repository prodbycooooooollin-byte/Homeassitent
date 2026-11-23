"use client";
import { Thumb } from "@/components/ui/Thumb";
import Link from "next/link";
import { Bookmark, Trash2 } from "lucide-react";
import { actions, useStore } from "@/lib/client/store";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/Section";
import { SpoilerToggle } from "@/components/detail/Spoiler";

export function SavedList() {
  const bookmarks = useStore((s) => s.bookmarks);
  return (
    <div className="mt-6">
      {bookmarks.length === 0 ? (
        <EmptyState icon={<Bookmark className="h-6 w-6" />} title="Nothing saved yet">
          Tap <strong>Save</strong> on any mission, unlock or secret to keep it one tap away while you play.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bookmarks.map((b) => (
            <li key={b.id} className="surface flex items-center gap-3 p-2 pr-2">
              <Link href={b.href} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-ink-700">
                  <Thumb src={b.src} art={b.art} className="h-full w-full" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{b.title}</span>
                  <span className="mt-1 flex items-center gap-2 text-xs capitalize text-fg-faint">
                    {b.kind.replace("-", " ")} <StatusBadge status={b.status} size="sm" short />
                  </span>
                </span>
              </Link>
              <button type="button" aria-label={`Remove ${b.title}`} onClick={() => actions.toggleBookmark(b)} className="rounded-lg p-2 text-fg-faint hover:bg-white/5 hover:text-status-unverified">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-10">
        <p className="eyebrow mb-2">Preferences</p>
        <SpoilerToggle />
      </div>
    </div>
  );
}
