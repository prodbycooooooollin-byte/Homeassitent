import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UserRound } from "lucide-react";
import { DetailHero, RelatedSection, TrustPanel } from "@/components/detail/DetailParts";
import { Panel } from "@/components/ui/Section";
import { getByKind, getBySlug } from "@/lib/content/repository";

export function generateStaticParams() {
  return getByKind("character").map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const c = getBySlug("character", params.slug);
  return c ? { title: c.title, description: c.summary } : {};
}

export default function CharacterPage({ params }: { params: { slug: string } }) {
  const c = getBySlug("character", params.slug);
  if (!c) notFound();
  return (
    <article>
      <DetailHero e={c} kindLabel={c.role} crumbs={[{ label: "Explore", href: "/explore" }, { label: c.title }]} />
      <div className="container-page mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="What's officially known" icon={<UserRound className="h-4 w-4" />}>
          <p className="text-[15px] leading-relaxed text-fg/90">{c.summary}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-fg-muted">
            {c.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-fg-faint">The backdrop is an abstract illustration, not character artwork.</p>
        </Panel>
        <TrustPanel e={c} />
      </div>
      <RelatedSection e={c} />
    </article>
  );
}
