import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarClock, CheckCircle2, Circle, Clock, ExternalLink, FileText, Link2, MapPin, Package, Swords, Trophy, Wallet } from "lucide-react";
import type { Entity, QualifiedValue, Requirement } from "@/lib/content/schema";
import { getById, getRelated, getSources, hrefFor } from "@/lib/content/repository";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EntityCard, posterWord } from "@/components/ui/EntityCard";
import { Media } from "@/components/ui/Media";
import { Panel, SectionHeader } from "@/components/ui/Section";
import { KindBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { BookmarkButton, ShareButton } from "./Actions";
import { TrackView } from "./TrackView";
export { StepList } from "./StepList";
import { STATUS_META } from "@/lib/ui-meta";
import { cn } from "@/lib/cn";

export function savedItemFor(e: Entity) {
  return { id: e.id, title: e.title, href: hrefFor(e), kind: e.kind, status: e.verification.status, art: e.media[0].art, src: e.media[0].src };
}

export function DetailHero({
  e,
  crumbs,
  kindLabel,
  meta,
}: {
  e: Entity;
  crumbs: { label: string; href?: string }[];
  kindLabel: string;
  meta?: ReactNode;
}) {
  const loc = e.locationId ? getById(e.locationId) : undefined;
  const item = savedItemFor(e);
  return (
    <header className="relative isolate">
      <TrackView item={item} />
      <div className="container-page pt-4">
        <Breadcrumbs items={crumbs} />
      </div>
      <div className="container-page mt-3">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08]">
          <Media media={e.media[0]} posterText={posterWord(e)} priority label className="aspect-[4/5] min-[480px]:aspect-[4/3] sm:aspect-[21/9] sm:[&_img.object-contain]:px-[24%] sm:[&_img.object-contain]:pb-[12%]" sizes="100vw" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <KindBadge label={kindLabel} />
              <StatusBadge status={e.verification.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <h1 className="h-display text-balance text-3xl leading-tight sm:text-5xl">{e.title}</h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
                  {loc ? (
                    <Link href={hrefFor(loc)} className="inline-flex items-center gap-1 hover:text-fg">
                      <MapPin className="h-4 w-4" /> {loc.title}
                    </Link>
                  ) : null}
                  {meta}
                </p>
              </div>
              <div className="flex gap-2">
                <BookmarkButton item={item} withLabel />
                <ShareButton title={e.title} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export function TrustPanel({ e }: { e: Entity }) {
  const meta = STATUS_META[e.verification.status];
  const sources = getSources(e.sources);
  return (
    <Panel title="Trust & sources" icon={<FileText className="h-4 w-4" />}>
      <div className={cn("rounded-xl border p-3", meta.border, meta.bg)}>
        <StatusBadge status={e.verification.status} size="sm" />
        <p className="mt-2 text-sm text-fg/90">{e.verification.note ?? meta.description}</p>
      </div>
      {sources.length ? (
        <ul className="mt-3 space-y-2">
          {sources.map((s) => (
            <li key={s.id} className="flex items-start gap-2 text-sm">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint" />
              <span className="min-w-0">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="link-underline inline-flex items-center gap-1">
                    {s.title} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span>{s.title}</span>
                )}
                <span className="block text-xs text-fg-faint">
                  {s.publisher}
                  {s.publishedAt ? ` · ${s.publishedAt}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-faint">
        <CalendarClock className="h-3.5 w-3.5" /> Updated {e.updatedAt}
        {e.verification.checkedAt ? ` · checked ${e.verification.checkedAt}` : ""}
      </p>
      <p className="mt-2 text-xs text-fg-faint">
        Spotted an error? <Link className="link-underline" href={`/about#corrections`}>Send a correction</Link>.
      </p>
    </Panel>
  );
}

const REQ_ICON: Record<Requirement["kind"], typeof Circle> = {
  mission: Swords,
  activity: Trophy,
  time: Clock,
  location: MapPin,
  item: Package,
  money: Wallet,
  progress: CheckCircle2,
  other: Circle,
};

export function RequirementList({ items, empty = "No requirements." }: { items: Requirement[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-fg-muted">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((r, i) => {
        const Icon = REQ_ICON[r.kind];
        const ref = r.ref ? getById(r.ref) : undefined;
        const body = (
          <>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/10 text-violet-300">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 text-sm">{r.label}</span>
          </>
        );
        return (
          <li key={i}>
            {ref ? (
              <Link href={hrefFor(ref)} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-2 pr-3 transition hover:border-violet-500/30">
                {body}
                <span className="text-xs text-violet-300">Open →</span>
              </Link>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-2 pr-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Visual prerequisite chain: walks requirement refs backwards (max depth 4). */
export function PrereqChain({ e }: { e: Entity }) {
  const chain: Entity[] = [];
  let cur: Entity | undefined = e;
  const seen = new Set<string>();
  while (cur && chain.length < 5 && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    const reqs: Requirement[] =
      cur.kind === "mission" || cur.kind === "unlock" || cur.kind === "money" ? cur.requirements : cur.kind === "easter-egg" ? cur.conditions : [];
    const next = reqs.map((r) => (r.ref ? getById(r.ref) : undefined)).find(Boolean);
    cur = next;
  }
  if (chain.length < 2) return null;
  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:items-stretch sm:gap-2" aria-label="Unlock path">
      {chain.map((c, i) => {
        const last = i === chain.length - 1;
        return (
          <li key={c.id} className="flex flex-col sm:flex-1 sm:flex-row sm:items-center sm:gap-2">
            <Link
              href={hrefFor(c)}
              aria-current={last ? "step" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border p-2 pr-3 text-sm transition sm:flex-1",
                last ? "border-violet-400/60 bg-violet-500/15 shadow-glow-sm" : "border-white/[0.07] bg-ink-900/60 hover:border-violet-500/30",
              )}
            >
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold", last ? "bg-violet-500 text-white" : "bg-white/10 text-fg-muted")}>{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.title}</span>
                <span className="block text-[11px] capitalize text-fg-faint">{c.kind === "unlock" ? c.category : c.kind.replace("-", " ")}</span>
              </span>
            </Link>
            {!last ? <span aria-hidden className="mx-auto h-4 w-px bg-violet-500/40 sm:h-px sm:w-4" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function ValueList({ items }: { items: QualifiedValue[] }) {
  return (
    <ul className="space-y-2">
      {items.map((v, i) => (
        <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 px-3 py-2 text-sm">
          <span className="text-fg-muted">{v.label}</span>
          <span className="flex items-center gap-2 text-right font-medium">
            {v.value}
            {v.status !== "verified" ? <StatusBadge status={v.status} size="sm" short /> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RelatedSection({ e, title = "Related intel" }: { e: Entity; title?: string }) {
  const related = getRelated(e, 4);
  if (!related.length) return null;
  return (
    <section className="container-page mt-12">
      <SectionHeader title={title} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {related.map((r) => (
          <EntityCard key={r.id} e={r} />
        ))}
      </div>
    </section>
  );
}

export function DemoCallout({ e }: { e: Entity }) {
  if (e.verification.status !== "demo") return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-status-demo/30 bg-status-demo/[0.08] p-3.5 text-sm text-fg/90">
      <StatusBadge status="demo" size="sm" short />
      <p>This is a sample record used to demonstrate VICE INTEL. It is not real GTA VI information.</p>
    </div>
  );
}
