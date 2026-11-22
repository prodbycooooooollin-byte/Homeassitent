import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { EntityCard, capitalize } from "@/components/ui/EntityCard";
import { FilterableGrid } from "@/components/lists/FilterableGrid";
import { facetOptions } from "@/lib/facets";
import { PageIntro } from "@/components/ui/PageIntro";
import { getById, getByKind } from "@/lib/content/repository";

export const metadata: Metadata = { title: "Unlock Database", description: "How to unlock GTA VI vehicles, weapons, equipment, clothing and properties." };

export default function UnlocksPage() {
  const unlocks = getByKind("unlock");
  return (
    <>
      <PageIntro title="Unlocks" eyebrow="Module 03" scene="garage" seed={213} icon={<Lock className="h-6 w-6" />}>
        Every card answers “how do I get this?” in one line. Open it for requirements, the unlock path and where to go.
      </PageIntro>
      <div className="container-page mt-6">
        <FilterableGrid
          placeholder="Filter unlocks…"
          columns="sm:grid-cols-2 lg:grid-cols-4"
          items={unlocks.map((u) => ({
            key: u.id,
            text: [u.title, u.summary, u.howTo, u.category, ...u.tags, ...u.aliases].join(" "),
            facets: { category: u.category, region: u.locationId ? getById(u.locationId)?.title ?? "" : "Anywhere" },
            sort: { name: u.title, reqs: u.requirements.length },
            node: <EntityCard e={u} />,
          }))}
          facets={[
            { facet: "category", label: "Category", options: facetOptions(unlocks, (u) => u.category, capitalize) },
            { facet: "region", label: "Region", options: facetOptions(unlocks, (u) => (u.locationId ? getById(u.locationId)?.title ?? "" : "Anywhere"), (v) => v) },
          ]}
          sorts={[
            { key: "name", label: "A–Z", dir: "asc" },
            { key: "reqs", label: "Fewest requirements", dir: "asc" },
          ]}
        />
      </div>
    </>
  );
}
