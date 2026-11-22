"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Camera, Search } from "lucide-react";
import { actions } from "@/lib/client/store";
import { cn } from "@/lib/cn";

/** Large search field with live suggestions and a direct camera / screenshot entry point. */
export function HeroSearch({ initial = "", autoFocus = false, className, placeholder = "Ask anything — “where is…”, “how do I unlock…”" }: { initial?: string; autoFocus?: boolean; className?: string; placeholder?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<{ title: string; href: string }[]>([]);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => setQ(initial), [initial]);

  useEffect(() => {
    const term = q.trim();
    if (!focused || term.length < 2 || term === initial) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}&prefix=1&limit=5`, { signal: ctrl.signal });
        if (res.ok) setSuggestions((await res.json()).results.map((r: { title: string; href: string }) => ({ title: r.title, href: r.href })));
      } catch {
        /* ignore */
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, focused, initial]);

  const submit = (term = q) => {
    const t = term.trim();
    if (!t) return ref.current?.focus();
    actions.pushQuery(t);
    setSuggestions([]);
    ref.current?.blur();
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };

  return (
    <div className={cn("relative", className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={cn(
          "group flex h-[60px] items-center gap-3 rounded-2xl border bg-ink-900/80 pl-4 pr-2 backdrop-blur-xl transition duration-300",
          focused ? "border-violet-400/70 shadow-glow" : "border-violet-500/35 shadow-glow-sm",
        )}
      >
        <Search aria-hidden className={cn("h-5 w-5 shrink-0 transition-colors", focused ? "text-violet-300" : "text-fg-muted")} />
        <input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          autoFocus={autoFocus}
          enterKeyHint="search"
          aria-label="Search VICE INTEL"
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-fg placeholder:text-fg-faint focus:outline-none"
        />
        <Link
          href="/scan"
          aria-label="Scan a screenshot"
          title="Scan a screenshot"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-violet-400/40 bg-violet-500/20 text-violet-200 transition hover:bg-violet-500/35"
        >
          <Camera className="h-5 w-5" />
        </Link>
      </form>
      {suggestions.length > 0 ? (
        <ul className="surface-raised absolute inset-x-0 top-[66px] z-30 animate-fade-up overflow-hidden p-1.5">
          {suggestions.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-fg hover:bg-violet-500/10" onClick={() => actions.pushQuery(q)}>
                <Search className="h-4 w-4 text-fg-faint" />
                {s.title}
              </Link>
            </li>
          ))}
          <li>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => submit()} className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-violet-300 hover:bg-violet-500/10">
              Search all intel for “{q.trim()}” →
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
