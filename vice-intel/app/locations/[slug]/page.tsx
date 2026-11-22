import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin, Sparkles } from "lucide-react";
import { DetailHero, TrustPanel } from "@/components/detail/DetailParts";
import { EntityCard } from "@/components/ui/EntityCard";
import { MiniMap } from "@/components/map/MiniMap";
import { Panel, SectionHeader } from "@/components/ui/Section";
import { getByKind, getBySlug, getInLocation } from "@/lib/content/repository";
import { KIND_META } from "@/lib/ui-meta";

export function generateStaticParams() {
  return getByKind("location").map((l) => ({ slug: l.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const l = getBySlug("location", params.slug);
  return l ? { title: `${l.title} — location`, description: l.summary } : {};
}

export default function LocationPage({ params }: { params: { slug: string } }) {
  const l = getBySlug("location", params.slug);
  if (!l) notFound();
  const inside = getInLocation(l.id);
  const groups = (["easter-egg", "mission", "unlock", "money"] as const).map((k) => ({ k, items: inside.filter((e) => e.kind === k) })).filter((g) => g.items.length);
  return (
    <article>
      <DetailHero e={l} kindLabel="Location" crumbs={[{ label: "Map", href: "/map" }, { label: l.title }]} meta={<span>{l.region}</span>} />
      <div className="container-page mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel>
            <p className="text-[15px] leading-relaxed text-fg/90">{l.summary}</p>
            <p className="mt-3 text-sm text-fg-muted">{l.character}</p>
          </Panel>
          <Panel title="Highlights" icon={<Sparkles className="h-4 w-4" />}>
            <ul className="flex flex-wrap gap-2">
              {l.highlights.map((h) => (
                <li key={h} className="chip">{h}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-fg-faint">Highlights summarise official pre-release material. In-game details may differ.</p>
          </Panel>
        </div>
        <aside className="space-y-5">
          {l.mapPoint ? (
            <Panel title="On the map" icon={<MapPin className="h-4 w-4" />}>
              <MiniMap point={l.mapPoint} focusId={l.id} label={l.title} />
            </Panel>
          ) : null}
          <TrustPanel e={l} />
        </aside>
      </div>
      {groups.map((g) => (
        <section key={g.k} className="container-page mt-10">
          <SectionHeader title={`${KIND_META[g.k].plural} in ${l.title}`} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {g.items.slice(0, 8).map((e) => (
              <EntityCard key={e.id} e={e} />
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}
