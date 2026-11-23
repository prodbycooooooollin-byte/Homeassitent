"use client";
import { Thumb } from "@/components/ui/Thumb";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowRight, CornerDownLeft, History, ScanLine, Search, X } from "lucide-react";
import { actions, useStore } from "@/lib/client/store";
import { KIND_META } from "@/lib/ui-meta";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import type { SourceCard } from "@/lib/ai/retrieval";
import { MODULES } from "./nav";

const EVENT = "vice-intel:palette";
export function openCommandPalette() {
  window.dispatchEvent(new Event(EVENT));
}

type Item =
  | { type: "result"; card: SourceCard }
  | { type: "query"; q: string; ai?: boolean }
  | { type: "link"; href: string; label: string; icon: typeof Search };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SourceCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const recentQueries = useStore((s) => s.recentQueries);
  const listId = useId();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener(EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
      document.documentElement.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      setQ("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}&prefix=1&limit=6`, { signal: ctrl.signal });
        if (res.ok) setResults((await res.json()).results);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 110);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const items: Item[] =
    q.trim().length >= 2
      ? [...results.map((card) => ({ type: "result" as const, card })), { type: "query", q: q.trim(), ai: true }]
      : [
          ...recentQueries.slice(0, 4).map((rq) => ({ type: "query" as const, q: rq })),
          ...MODULES.map((m) => ({ type: "link" as const, href: m.href, label: m.label, icon: m.icon })),
        ];

  useEffect(() => setActive(0), [q, results.length]);

  const go = useCallback(
    (item: Item) => {
      setOpen(false);
      if (item.type === "result") {
        actions.pushQuery(q);
        router.push(item.card.href);
      } else if (item.type === "query") {
        actions.pushQuery(item.q);
        router.push(`/search?q=${encodeURIComponent(item.q)}`);
      } else router.push(item.href);
    },
    [q, router],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-3 pt-[8vh] backdrop-blur-sm sm:pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search VICE INTEL"
        className="surface-raised w-full max-w-xl animate-fade-up overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
          <Search className={cn("h-5 w-5 shrink-0", loading ? "animate-pulse text-violet-400" : "text-fg-faint")} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const it = items[active] ?? (q.trim() ? { type: "query" as const, q: q.trim() } : undefined);
                if (it) go(it);
              }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={`${listId}-${active}`}
            placeholder="Search missions, unlocks, secrets, places…"
            className="h-14 w-full bg-transparent text-base text-fg placeholder:text-fg-faint focus:outline-none"
          />
          <button type="button" onClick={() => setOpen(false)} aria-label="Close search" className="rounded-lg p-1.5 text-fg-faint hover:bg-white/5 hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul id={listId} role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {q.trim().length < 2 && recentQueries.length > 0 ? <li className="eyebrow px-3 pb-1 pt-2">Recent</li> : null}
          {items.map((it, i) => {
            const on = i === active;
            const base = cn("flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left", on ? "bg-violet-500/15" : "hover:bg-white/[0.04]");
            if (it.type === "result")
              return (
                <li key={it.card.id} id={`${listId}-${i}`} role="option" aria-selected={on} className={base} onMouseEnter={() => setActive(i)} onClick={() => go(it)}>
                  <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-ink-700">
                    <Thumb src={it.card.src} art={it.card.art} className="h-full w-full" contain={it.card.kind === "unlock"} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">{it.card.title}</span>
                    <span className="block truncate text-xs text-fg-faint">{KIND_META[it.card.kind].label} · {it.card.summary}</span>
                  </span>
                  <StatusBadge status={it.card.status} size="sm" short />
                </li>
              );
            if (it.type === "query")
              return (
                <li key={`q-${it.q}-${i}`} id={`${listId}-${i}`} role="option" aria-selected={on} className={base} onMouseEnter={() => setActive(i)} onClick={() => go(it)}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-500/10 text-violet-300">
                    {it.ai ? <ArrowRight className="h-4 w-4" /> : <History className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-fg">
                    {it.ai ? (
                      <>
                        Ask Intel: <span className="text-violet-300">“{it.q}”</span>
                      </>
                    ) : (
                      it.q
                    )}
                  </span>
                  {on ? <CornerDownLeft className="h-4 w-4 text-fg-faint" /> : null}
                </li>
              );
            const Icon = it.icon;
            return (
              <li key={it.href} id={`${listId}-${i}`} role="option" aria-selected={on} className={base} onMouseEnter={() => setActive(i)} onClick={() => go(it)}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-fg-muted">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-fg">{it.label}</span>
                <ArrowRight className="h-4 w-4 text-fg-faint" />
              </li>
            );
          })}
          {q.trim().length >= 2 && !loading && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-fg-muted">No direct matches — press Enter to ask Intel.</li>
          ) : null}
        </ul>
        <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-2 text-[11px] text-fg-faint">
          <span>↑↓ navigate · Enter open · Esc close</span>
          <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={() => go({ type: "link", href: "/scan", label: "Scan", icon: ScanLine })}>
            <ScanLine className="h-3.5 w-3.5" /> Scan a screenshot
          </button>
        </div>
      </div>
    </div>
  );
}
