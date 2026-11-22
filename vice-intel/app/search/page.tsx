import type { Metadata } from "next";
import Link from "next/link";
import { ScanLine, SearchX } from "lucide-react";
import { HeroSearch } from "@/components/search/HeroSearch";
import { AskPanel } from "@/components/search/AskPanel";
import { EntityCard } from "@/components/ui/EntityCard";
import { EmptyState } from "@/components/ui/Section";
import { getById } from "@/lib/content/repository";
import { ENTITY_KINDS, type Entity, type EntityKind } from "@/lib/content/schema";
import { search } from "@/lib/search/engine";
import { INTENT_LABEL } from "@/lib/search/intent";
import { KIND_META } from "@/lib/ui-meta";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

const BROWSE = [
  { q: "boats", label: "Boats" },
  { q: "night only secrets", label: "Night-only secrets" },
  { q: "early game money", label: "Early money" },
  { q: "stealth missions", label: "Stealth missions" },
  { q: "properties", label: "Properties" },
  { q: "wetlands", label: "Wetlands" },
];

export default function SearchPage({ searchParams }: { searchParams: { q?: string; kind?: string } }) {
  const q = (searchParams.q ?? "").slice(0, 200).trim();
  const kind = (ENTITY_KINDS as readonly string[]).includes(searchParams.kind ?? "") ? (searchParams.kind as EntityKind) : undefined;
  const all = q ? search(q, { limit: 40 }) : null;
  const hits = all?.hits.map((h) => getById(h.id)!).filter(Boolean) ?? [];
  const counts = hits.reduce<Record<string, number>>((acc, e) => ((acc[e.kind] = (acc[e.kind] ?? 0) + 1), acc), {});
  const shown = kind ? hits.filter((e) => e.kind === kind) : hits;
  const href = (k?: string) => `/search?q=${encodeURIComponent(q)}${k ? `&kind=${k}` : ""}`;

  return (
    <div className="container-page pt-6 sm:pt-10">
      <h1 className="sr-only">Search</h1>
      <HeroSearch initial={q} autoFocus={!q} className="mx-auto max-w-3xl" />

      {!q ? (
        <div className="mx-auto mt-8 max-w-3xl">
          <p className="eyebrow mb-3">Browse by topic</p>
          <div className="flex flex-wrap gap-2">
            {BROWSE.map((b) => (
              <Link key={b.q} href={`/search?q=${encodeURIComponent(b.q)}`} className="chip">
                {b.label}
              </Link>
            ))}
          </div>
          <Link href="/scan" className="surface mt-8 flex items-center gap-4 p-4 hover:border-violet-500/30">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-violet-500/15 text-violet-300">
              <ScanLine className="h-6 w-6" />
            </span>
            <span>
              <span className="block font-medium">Not sure what it&apos;s called?</span>
              <span className="block text-sm text-fg-muted">Scan a screenshot or a photo of your TV instead.</span>
            </span>
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start">
          <div className="min-w-0 lg:sticky lg:top-24">
            <AskPanel query={q} />
          </div>

          <div>
            {all?.didYouMean ? (
              <p className="mb-3 text-sm text-fg-muted">
                Showing results for <Link className="link-underline text-violet-300" href={`/search?q=${encodeURIComponent(all.didYouMean)}`}>{all.didYouMean}</Link>
              </p>
            ) : null}
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-fg-muted">
                <span className="text-fg">{hits.length}</span> result{hits.length === 1 ? "" : "s"}
                {all && all.intent.intent !== "general" ? <> · {INTENT_LABEL[all.intent.intent]}</> : null}
              </p>
            </div>
            {hits.length > 0 ? (
              <nav aria-label="Filter results" className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
                <Link href={href()} className={cn("chip shrink-0", !kind && "chip-active")}>
                  All <span className="text-fg-faint">{hits.length}</span>
                </Link>
                {ENTITY_KINDS.filter((k) => counts[k]).map((k) => (
                  <Link key={k} href={href(k)} className={cn("chip shrink-0", kind === k && "chip-active")}>
                    {KIND_META[k].plural} <span className="text-fg-faint">{counts[k]}</span>
                  </Link>
                ))}
              </nav>
            ) : null}

            {shown.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {shown.map((e: Entity, i) => (
                  <EntityCard key={e.id} e={e} variant={i < 2 && !kind ? "default" : "row"} className={i < 2 && !kind ? "" : "sm:col-span-2"} />
                ))}
              </div>
            ) : (
              <EmptyState icon={<SearchX className="h-6 w-6" />} title="No matching intel yet">
                Try fewer or different words, check the spelling, or{" "}
                <Link href="/scan" className="link-underline text-violet-300">scan a screenshot</Link>. If it&apos;s brand new, it may not be in the knowledge base yet.
              </EmptyState>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
