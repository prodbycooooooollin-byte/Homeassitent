"use client";
import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Check, Share2 } from "lucide-react";
import { actions, useStore, type SavedItem } from "@/lib/client/store";
import { cn } from "@/lib/cn";

export function BookmarkButton({ item, className, withLabel }: { item: Omit<SavedItem, "savedAt">; className?: string; withLabel?: boolean }) {
  const saved = useStore((s) => s.bookmarks.some((b) => b.id === item.id));
  return (
    <button
      type="button"
      onClick={() => actions.toggleBookmark(item)}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save for later"}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium backdrop-blur transition",
        saved ? "border-violet-400/60 bg-violet-500/20 text-violet-200" : "border-white/15 bg-black/30 text-fg hover:border-violet-400/50",
        className,
      )}
    >
      {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
      {withLabel ? (saved ? "Saved" : "Save") : null}
    </button>
  );
}

export function ShareButton({ title, className }: { title: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && "share" in navigator), []);
  const share = async () => {
    const url = window.location.href;
    try {
      if (canShare) await navigator.share({ title: `${title} · VICE INTEL`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* user cancelled */
    }
  };
  return (
    <button
      type="button"
      onClick={share}
      aria-label={canShare ? "Share" : "Copy link"}
      className={cn("inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-fg backdrop-blur transition hover:border-violet-400/50", className)}
    >
      {copied ? <Check className="h-4 w-4 text-status-verified" /> : <Share2 className="h-4 w-4" />}
      <span className="sr-only sm:not-sr-only">{copied ? "Copied" : "Share"}</span>
    </button>
  );
}
