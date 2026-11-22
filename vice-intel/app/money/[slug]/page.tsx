import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, Gauge, Lightbulb, ListChecks, MapPin, Repeat, Wallet } from "lucide-react";
import { DemoCallout, DetailHero, PrereqChain, RelatedSection, RequirementList, StepList, TrustPanel } from "@/components/detail/DetailParts";
import { MiniMap } from "@/components/map/MiniMap";
import { Panel } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getByKind, getBySlug } from "@/lib/content/repository";
import { formatMoney } from "@/lib/ui-meta";

export function generateStaticParams() {
  return getByKind("money").map((m) => ({ slug: m.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const m = getBySlug("money", params.slug);
  if (!m) return {};
  return { title: `${m.title} — money guide`, description: m.summary, robots: m.verification.status === "demo" ? { index: false } : undefined };
}

export default function MoneyDetail({ params }: { params: { slug: string } }) {
  const m = getBySlug("money", params.slug);
  if (!m) notFound();
  const rate = Math.round(((m.payout.min + m.payout.max) / 2 / ((m.duration.min + m.duration.max) / 2)) * 60);
  const stats = [
    { icon: Wallet, label: "Payout", value: `${formatMoney(m.payout.min)}–${formatMoney(m.payout.max)}`, status: m.payout.status },
    { icon: Clock, label: "Time per run", value: `${m.duration.min}–${m.duration.max} min`, status: m.duration.status },
    { icon: Gauge, label: "≈ per hour", value: formatMoney(rate), status: m.payout.status },
    { icon: Repeat, label: "Repeatable", value: m.repeatable === "cooldown" ? `Every ${m.cooldownMinutes} min` : m.repeatable, status: m.verification.status },
  ];
  return (
    <article>
      <DetailHero e={m} kindLabel="Money" crumbs={[{ label: "Money Intel", href: "/money" }, { label: m.title }]} meta={<span className="capitalize">{m.progression} game · {m.difficulty}</span>} />
      <div className="container-page mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((s) => (
              <li key={s.label} className="surface p-4">
                <s.icon className="h-4 w-4 text-violet-400" />
                <p className="mt-2 text-xs text-fg-faint">{s.label}</p>
                <p className="font-display text-lg font-semibold capitalize">{s.value}</p>
                <StatusBadge status={s.status} size="sm" short className="mt-2" />
              </li>
            ))}
          </ul>
          <DemoCallout e={m} />
          <Panel title="Overview">
            <p className="text-[15px] leading-relaxed text-fg/90">{m.summary}</p>
            {m.startupCost ? <p className="mt-2 text-sm text-fg-muted">Startup cost: <span className="text-fg">{formatMoney(m.startupCost)}</span></p> : null}
          </Panel>
          {m.strategy.length ? (
            <Panel title="Strategy" icon={<Lightbulb className="h-4 w-4" />}>
              <ul className="space-y-2">
                {m.strategy.map((s, i) => (
                  <li key={i} className="flex gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-3 text-sm">
                    <span className="font-display font-semibold text-violet-300">{i + 1}</span> {s}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {m.steps.length ? (
            <Panel title="Step by step" icon={<ListChecks className="h-4 w-4" />}>
              <StepList steps={m.steps} />
            </Panel>
          ) : null}
        </div>
        <aside className="space-y-5">
          <Panel title="Requirements" icon={<ListChecks className="h-4 w-4" />}>
            <RequirementList items={m.requirements} empty="Available from the start." />
            {m.requirements.some((r) => r.ref) ? (
              <div className="mt-4">
                <PrereqChain e={m} />
              </div>
            ) : null}
          </Panel>
          {m.mapPoint ? (
            <Panel title="Where" icon={<MapPin className="h-4 w-4" />}>
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
