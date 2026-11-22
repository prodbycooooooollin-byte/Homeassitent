import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen, FileText, Gift, Image as ImageIcon, ListChecks, MapPin, MessagesSquare } from "lucide-react";
import { DemoCallout, DetailHero, RelatedSection, RequirementList, StepList, TrustPanel, ValueList } from "@/components/detail/DetailParts";
import { Gallery } from "@/components/detail/Gallery";
import { capitalize } from "@/components/ui/EntityCard";
import { MiniMap } from "@/components/map/MiniMap";
import { Panel } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getByKind, getBySlug } from "@/lib/content/repository";

export function generateStaticParams() {
  return getByKind("easter-egg").map((e) => ({ slug: e.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const e = getBySlug("easter-egg", params.slug);
  if (!e) return {};
  return { title: `${e.title} — Easter egg`, description: e.summary, robots: e.verification.status === "demo" ? { index: false } : undefined };
}

export default function EggPage({ params }: { params: { slug: string } }) {
  const e = getBySlug("easter-egg", params.slug);
  if (!e) notFound();
  return (
    <article>
      <DetailHero e={e} kindLabel="Easter Egg" crumbs={[{ label: "Easter Eggs", href: "/easter-eggs" }, { label: e.title }]} meta={<span>{capitalize(e.category)}</span>} />
      <div className="container-page mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <DemoCallout e={e} />
          <Panel title="Description" icon={<FileText className="h-4 w-4" />}>
            <p className="text-[15px] leading-relaxed text-fg/90">{e.summary}</p>
          </Panel>
          <div className="grid gap-5 md:grid-cols-2">
            <Panel title="Conditions" icon={<ListChecks className="h-4 w-4" />}>
              <RequirementList items={e.conditions} empty="No special conditions." />
            </Panel>
            {e.rewards.length ? (
              <Panel title="Reward" icon={<Gift className="h-4 w-4" />}>
                <ValueList items={e.rewards} />
              </Panel>
            ) : (
              <Panel title="Reward" icon={<Gift className="h-4 w-4" />}>
                <p className="text-sm text-fg-muted">No known reward — this one is about the discovery.</p>
              </Panel>
            )}
          </div>
          {e.steps.length ? (
            <Panel title="How to find it" icon={<ListChecks className="h-4 w-4" />}>
              <StepList steps={e.steps} />
            </Panel>
          ) : null}
          {e.claims.length ? (
            <Panel title="Theories & community claims" icon={<MessagesSquare className="h-4 w-4" />}>
              <p className="mb-3 text-xs text-fg-faint">Not confirmed. Shown separately from the facts above.</p>
              <ul className="space-y-2">
                {e.claims.map((c, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-3 text-sm">
                    <StatusBadge status={c.status} size="sm" short />
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {e.background ? (
            <Panel title="Background" icon={<BookOpen className="h-4 w-4" />}>
              <p className="text-sm leading-relaxed text-fg-muted">{e.background}</p>
            </Panel>
          ) : null}
        </div>
        <aside className="space-y-5">
          {e.mapPoint ? (
            <Panel title="Location" icon={<MapPin className="h-4 w-4" />}>
              <MiniMap point={e.mapPoint} focusId={e.id} label={e.title} />
            </Panel>
          ) : null}
          {e.media.length > 1 ? (
            <Panel title={`Gallery (${e.media.length})`} icon={<ImageIcon className="h-4 w-4" />}>
              <Gallery items={e.media} />
            </Panel>
          ) : null}
          <TrustPanel e={e} />
        </aside>
      </div>
      <RelatedSection e={e} />
    </article>
  );
}
