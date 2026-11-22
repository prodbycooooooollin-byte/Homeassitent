import type { Metadata } from "next";
import Link from "next/link";
import { Egg, LayoutGrid, Map } from "lucide-react";
import { EntityCard, capitalize } from "@/components/ui/EntityCard";
import { FilterableGrid } from "@/components/lists/FilterableGrid";
import { facetOptions } from "@/lib/facets";
import { IntelMap } from "@/components/map/IntelMap";
import { PageIntro } from "@/components/ui/PageIntro";
import { getById, getByKind } from "@/lib/content/repository";
import { getMapPins } from "@/lib/map/points";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Easter Egg Hunter", description: "Secrets, mysteries, hidden places and references in GTA VI — with clear verification labels." };

export default function EggsPage({ searchParams }: { searchParams: { view?: string } }) {
  const eggs = getByKind("easter-egg");
  const view = searchParams.view === "map" ? "map" : "grid";
  return (
    <>
      <PageIntro slot="easter-eggs-header" title="Easter Egg Hunter" eyebrow="Module 04" scene="night-sky" seed={302} icon={<Egg className="h-6 w-6" />}>
        Confirmed secrets, theories and community claims — always kept apart and clearly labelled.
      </PageIntro>
      <div className="container-page mt-6">
        <div className="mb-5 inline-flex rounded-xl border border-white/10 bg-ink-900/70 p-1" role="tablist" aria-label="View">
          {[
            { v: "grid", label: "Gallery", icon: LayoutGrid },
            { v: "map", label: "Map", icon: Map },
          ].map(({ v, label, icon: Icon }) => (
            <Link
              key={v}
              role="tab"
              aria-selected={view === v}
              href={v === "grid" ? "/easter-eggs" : "/easter-eggs?view=map"}
              className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm", view === v ? "bg-violet-500 text-white shadow-glow-sm" : "text-fg-muted hover:text-fg")}
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
        </div>
        {view === "map" ? (
          <IntelMap pins={getMapPins(["easter-egg", "location"])} kinds={["easter-egg", "location"]} />
        ) : (
          <FilterableGrid
            placeholder="Filter secrets…"
            columns="sm:grid-cols-2 lg:grid-cols-3"
            items={eggs.map((e, i) => ({
              key: e.id,
              text: [e.title, e.summary, e.category, ...e.tags, ...e.aliases].join(" "),
              facets: { category: e.category, region: e.locationId ? getById(e.locationId)?.title ?? "" : "" },
              node: <EntityCard e={e} variant={i % 5 === 0 ? "tall" : "default"} />,
            }))}
            facets={[
              { facet: "category", label: "Type", options: facetOptions(eggs, (e) => e.category, capitalize) },
              { facet: "region", label: "Region", options: facetOptions(eggs, (e) => (e.locationId ? getById(e.locationId)?.title ?? "" : ""), (v) => v) },
            ]}
          />
        )}
      </div>
    </>
  );
}
