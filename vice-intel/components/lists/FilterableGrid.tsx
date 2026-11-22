"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface GridItem {
  key: string;
  text: string;
  facets: Record<string, string>;
  sort?: Record<string, number | string>;
  node: ReactNode;
}
export interface FacetConfig {
  facet: string;
  label: string;
  options: { value: string; label: string; count?: number }[];
}

/** Client-side filtering for module index pages. Cards are server-rendered and passed in as nodes. */
export function FilterableGrid({
  items,
  facets,
  sorts,
  placeholder = "Filter…",
  columns = "sm:grid-cols-2 lg:grid-cols-3",
  empty = "Nothing matches these filters.",
}: {
  items: GridItem[];
  facets: FacetConfig[];
  sorts?: { key: string; label: string; dir: "asc" | "desc" }[];
  placeholder?: string;
  columns?: string;
  empty?: string;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(sorts?.[0]?.key ?? "");

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    let out = items.filter((it) => {
      for (const [f, v] of Object.entries(active)) if (v && it.facets[f] !== v) return false;
      const t = it.text.toLowerCase();
      return terms.every((term) => t.includes(term));
    });
    const s = sorts?.find((x) => x.key === sort);
    if (s) {
      out = [...out].sort((a, b) => {
        const av = a.sort?.[s.key] ?? 0;
        const bv = b.sort?.[s.key] ?? 0;
        const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return s.dir === "asc" ? c : -c;
      });
    }
    return out;
  }, [items, q, active, sort, sorts]);

  const activeCount = Object.values(active).filter(Boolean).length;

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-ink-900/70 px-3 focus-within:border-violet-500/50 lg:w-72">
          <Search className="h-4 w-4 text-fg-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-full flex-1 bg-transparent text-[15px] placeholder:text-fg-faint focus:outline-none" />
          {q ? (
            <button type="button" onClick={() => setQ("")} aria-label="Clear filter text">
              <X className="h-4 w-4 text-fg-faint" />
            </button>
          ) : null}
        </label>
        {sorts && sorts.length > 1 ? (
          <label className="flex items-center gap-2 text-sm text-fg-muted lg:order-last lg:ml-auto">
            <SlidersHorizontal className="h-4 w-4" />
            <span className="sr-only">Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 rounded-xl border border-white/10 bg-ink-900 px-2 text-fg focus:border-violet-500/50 focus:outline-none">
              {sorts.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        {facets.map((f) => (
          <div key={f.facet} role="group" aria-label={f.label} className="scrollbar-none -mx-4 flex items-center gap-2 overflow-x-auto px-4">
            <span className="eyebrow mr-1 shrink-0">{f.label}</span>
            <button type="button" onClick={() => setActive((a) => ({ ...a, [f.facet]: "" }))} className={cn("chip shrink-0 py-1 text-[13px]", !active[f.facet] && "chip-active")} aria-pressed={!active[f.facet]}>
              All
            </button>
            {f.options.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={active[f.facet] === o.value}
                onClick={() => setActive((a) => ({ ...a, [f.facet]: a[f.facet] === o.value ? "" : o.value }))}
                className={cn("chip shrink-0 py-1 text-[13px]", active[f.facet] === o.value && "chip-active")}
              >
                {o.label}
                {o.count !== undefined ? <span className="text-fg-faint">{o.count}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm text-fg-muted" aria-live="polite">
        {shown.length} of {items.length}
        {activeCount || q ? (
          <button type="button" className="ml-3 text-violet-300 hover:underline" onClick={() => (setActive({}), setQ(""))}>
            Reset filters
          </button>
        ) : null}
      </p>

      {shown.length ? (
        <div className={cn("mt-3 grid grid-cols-1 gap-4", columns)}>
          {shown.map((it) => (
            <div key={it.key} className="animate-fade-up">
              {it.node}
            </div>
          ))}
        </div>
      ) : (
        <div className="surface mt-3 p-10 text-center text-sm text-fg-muted">{empty}</div>
      )}
    </div>
  );
}

