import type { Metadata } from "next";
import { Crosshair } from "lucide-react";
import { EntityCard } from "@/components/ui/EntityCard";
import { FilterableGrid } from "@/components/lists/FilterableGrid";
import { facetOptions } from "@/lib/facets";
import { PageIntro } from "@/components/ui/PageIntro";
import { SpoilerToggle } from "@/components/detail/Spoiler";
import { getByKind } from "@/lib/content/repository";

export const metadata: Metadata = { title: "Mission Solver", description: "Walkthroughs and objective-level help for GTA VI missions." };

export default function MissionsPage() {
  const missions = getByKind("mission");
  return (
    <>
      <PageIntro slot="missions" title="Mission Solver" eyebrow="Module 02" scene="harbor" seed={101} icon={<Crosshair className="h-6 w-6" />}>
        Open a mission and pick the objective you&apos;re on. You get the steps, the usual failure point and a backup plan — not a wall of text.
      </PageIntro>
      <div className="container-page mt-6">
        <div className="mb-4 flex justify-end">
          <SpoilerToggle />
        </div>
        <FilterableGrid
          placeholder="Filter missions…"
          items={missions.map((m) => ({
            key: m.id,
            text: [m.title, m.summary, m.startLocation, ...m.tags, ...m.aliases].join(" "),
            facets: { chapter: m.chapter ?? "Other", difficulty: m.difficulty ?? "unknown" },
            node: <EntityCard e={m} />,
          }))}
          facets={[
            { facet: "chapter", label: "Chapter", options: facetOptions(missions, (m) => m.chapter ?? "Other", (v) => v) },
            { facet: "difficulty", label: "Difficulty", options: facetOptions(missions, (m) => m.difficulty ?? "unknown") },
          ]}
        />
      </div>
    </>
  );
}
