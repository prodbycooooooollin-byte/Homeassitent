import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BarChart3, KeyRound, ListChecks, MapPin, Tag } from "lucide-react";
import { DemoCallout, DetailHero, PrereqChain, RelatedSection, RequirementList, StepList, TrustPanel, ValueList } from "@/components/detail/DetailParts";
import { capitalize } from "@/components/ui/EntityCard";
import { MiniMap } from "@/components/map/MiniMap";
import { Panel } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getByKind, getBySlug } from "@/lib/content/repository";

export function generateStaticParams() {
  return getByKind("unlock").map((u) => ({ slug: u.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const u = getBySlug("unlock", params.slug);
  if (!u) return {};
  return { title: `How to unlock ${u.title}`, description: u.howTo, robots: u.verification.status === "demo" ? { index: false } : undefined };
}

export default function UnlockPage({ params }: { params: { slug: string } }) {
  const u = getBySlug("unlock", params.slug);
  if (!u) notFound();
  const chain = <PrereqChain e={u} />;
  return (
    <article>
      <DetailHero
        e={u}
        kindLabel={capitalize(u.category)}
        crumbs={[{ label: "Unlocks", href: "/unlocks" }, { label: u.title }]}
        meta={
          u.price ? (
            <span className="inline-flex items-center gap-1">
              <Tag className="h-4 w-4" /> {u.price.value}
            </span>
          ) : null
        }
      />
      <div className="container-page mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {/* The answer first */}
          <section className="surface-raised relative overflow-hidden p-5 sm:p-6">
            <div className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-violet-500/25 blur-3xl" />
            <p className="eyebrow flex items-center gap-2 text-violet-300">
              <KeyRound className="h-4 w-4" /> How to unlock
            </p>
            <p className="mt-2 font-display text-xl font-semibold leading-snug sm:text-2xl">{u.howTo}</p>
            <div className="mt-3 flex items-center gap-2">
              <StatusBadge status={u.verification.status} size="sm" />
            </div>
          </section>
          <DemoCallout e={u} />
          {u.requirements.some((r) => r.ref) ? (
            <Panel title="Unlock path" icon={<ListChecks className="h-4 w-4" />}>
              {chain}
            </Panel>
          ) : null}
          {u.steps.length ? (
            <Panel title="Step by step" icon={<ListChecks className="h-4 w-4" />}>
              <StepList steps={u.steps} />
            </Panel>
          ) : null}
          <Panel title="About">
            <p className="text-[15px] leading-relaxed text-fg/90">{u.summary}</p>
          </Panel>
        </div>
        <aside className="space-y-5">
          <Panel title="Requirements" icon={<ListChecks className="h-4 w-4" />}>
            <RequirementList items={u.requirements} empty="No requirements — available right away." />
          </Panel>
          {u.price || u.stats.length ? (
            <Panel title="Details" icon={<BarChart3 className="h-4 w-4" />}>
              <ValueList items={[...(u.price ? [u.price] : []), ...u.stats]} />
            </Panel>
          ) : null}
          {u.mapPoint ? (
            <Panel title="Where" icon={<MapPin className="h-4 w-4" />}>
              <MiniMap point={u.mapPoint} focusId={u.id} label={u.title} />
            </Panel>
          ) : null}
          <TrustPanel e={u} />
        </aside>
      </div>
      <RelatedSection e={u} />
    </article>
  );
}
