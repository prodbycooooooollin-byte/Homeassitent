import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Flag, Gauge, ListChecks, MapPin, Trophy } from "lucide-react";
import { DemoCallout, DetailHero, PrereqChain, RelatedSection, RequirementList, StepList, TrustPanel, ValueList } from "@/components/detail/DetailParts";
import { Spoiler, SpoilerToggle } from "@/components/detail/Spoiler";
import { ObjectiveHelper } from "@/components/mission/ObjectiveHelper";
import { MiniMap } from "@/components/map/MiniMap";
import { Panel } from "@/components/ui/Section";
import { getByKind, getBySlug } from "@/lib/content/repository";

export function generateStaticParams() {
  return getByKind("mission").map((m) => ({ slug: m.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const m = getBySlug("mission", params.slug);
  if (!m) return {};
  return { title: `${m.title} — mission guide`, description: m.summary, robots: m.verification.status === "demo" ? { index: false } : undefined };
}

export default function MissionPage({ params }: { params: { slug: string } }) {
  const m = getBySlug("mission", params.slug);
  if (!m) notFound();
  return (
    <article>
      <DetailHero
        e={m}
        kindLabel="Mission"
        crumbs={[{ label: "Missions", href: "/missions" }, { label: m.title }]}
        meta={
          <>
            {m.chapter ? (
              <span className="inline-flex items-center gap-1">
                <Flag className="h-4 w-4" /> {m.chapter}
              </span>
            ) : null}
            {m.difficulty ? (
              <span className="inline-flex items-center gap-1 capitalize">
                <Gauge className="h-4 w-4" /> {m.difficulty}
              </span>
            ) : null}
          </>
        }
      />
      <div className="container-page mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <DemoCallout e={m} />
          <Panel>
            <p className="text-[15px] leading-relaxed text-fg/90">{m.summary}</p>
            <p className="mt-3 flex items-center gap-1.5 text-sm text-fg-muted">
              <MapPin className="h-4 w-4 text-violet-400" /> Starts at <span className="text-fg">{m.startLocation}</span>
              {m.giver ? <> · from {m.giver}</> : null}
            </p>
          </Panel>
          <ObjectiveHelper mission={{ id: m.id, title: m.title, objectives: m.objectives }} />
          <Panel title="Full walkthrough" icon={<ListChecks className="h-4 w-4" />} action={<SpoilerToggle />}>
            <div className="space-y-2">
              {m.objectives.map((o, i) => {
                const inner = (
                  <div className="pb-2 pt-3">
                    <StepList steps={o.steps} />
                  </div>
                );
                return (
                  <details key={o.id} className="group rounded-xl border border-white/[0.06] bg-ink-900/50 px-3 open:bg-ink-900/80">
                    <summary className="flex cursor-pointer list-none items-center gap-3 py-3 font-medium">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-xs">{i + 1}</span>
                      {o.spoiler ? <Spoiler label="title" className="flex-1">{o.title}</Spoiler> : <span className="flex-1">{o.title}</span>}
                      <span className="text-fg-faint transition group-open:rotate-90">›</span>
                    </summary>
                    {o.spoiler ? <Spoiler label="objective">{inner}</Spoiler> : inner}
                  </details>
                );
              })}
            </div>
          </Panel>
        </div>
        <aside className="space-y-5">
          <Panel title="Requirements" icon={<ListChecks className="h-4 w-4" />}>
            <RequirementList items={m.requirements} empty="Available from the start." />
            {m.requirements.some((r) => r.ref) ? (
              <div className="mt-4">
                <p className="eyebrow mb-2">Story path</p>
                <PrereqChain e={m} />
              </div>
            ) : null}
          </Panel>
          {m.rewards.length ? (
            <Panel title="Rewards" icon={<Trophy className="h-4 w-4" />}>
              <ValueList items={m.rewards} />
            </Panel>
          ) : null}
          {m.mapPoint ? (
            <Panel title="Start location" icon={<MapPin className="h-4 w-4" />}>
              <MiniMap point={m.mapPoint} focusId={m.id} label={m.title} />
            </Panel>
          ) : null}
          <TrustPanel e={m} />
        </aside>
      </div>
      <RelatedSection e={m} />
    </article>
  );
}
