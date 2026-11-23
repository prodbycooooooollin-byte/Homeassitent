"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Media as MediaT } from "@/lib/content/schema";
import { Media } from "@/components/ui/Media";
import { cn } from "@/lib/cn";

export function Gallery({ items }: { items: MediaT[] }) {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i! + 1) % items.length);
      if (e.key === "ArrowLeft") setOpen((i) => (i! - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items.length]);

  return (
    <>
      <ul className="grid grid-cols-2 gap-2">
        {items.map((m, i) => (
          <li key={m.id}>
            <button type="button" onClick={() => setOpen(i)} className={cn("group block w-full overflow-hidden rounded-xl border-2 transition", i === 0 ? "border-violet-500/70" : "border-transparent hover:border-violet-500/40")} aria-label={`View image: ${m.alt}`}>
              <Media media={m} className="aspect-[4/3]" sizes="200px" />
            </button>
          </li>
        ))}
      </ul>
      {open !== null ? (
        <div role="dialog" aria-modal="true" aria-label="Image viewer" className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur" onClick={() => setOpen(null)}>
          <div className="flex items-center justify-between p-3 text-sm text-fg-muted">
            <span>
              {open + 1} / {items.length}
            </span>
            <button type="button" aria-label="Close" className="rounded-lg p-2 hover:bg-white/10" onClick={() => setOpen(null)}>
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-3" onClick={(e) => e.stopPropagation()}>
            <figure className="w-full max-w-5xl animate-fade-up">
              <Media media={items[open]} label className="aspect-video rounded-2xl" sizes="100vw" priority />
              <figcaption className="mt-3 text-center text-sm text-fg-muted">
                {items[open].caption ?? items[open].alt}
                <span className="block text-xs text-fg-faint">{items[open].attribution.label} · {items[open].attribution.license}</span>
              </figcaption>
            </figure>
            {items.length > 1 ? (
              <>
                <button type="button" aria-label="Previous image" className="absolute left-3 rounded-full bg-white/10 p-3 hover:bg-white/20" onClick={() => setOpen((i) => (i! - 1 + items.length) % items.length)}>
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button type="button" aria-label="Next image" className="absolute right-3 rounded-full bg-white/10 p-3 hover:bg-white/20" onClick={() => setOpen((i) => (i! + 1) % items.length)}>
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
