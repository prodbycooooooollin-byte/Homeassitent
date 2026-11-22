import Link from "next/link";
import { ArrowUpRight, MapPinned, ShieldCheck, Sparkles } from "lucide-react";
import { HeroSearch } from "@/components/search/HeroSearch";
import { RecentlyViewed } from "@/components/home/RecentlyViewed";
import { MODULES } from "@/components/layout/nav";
import { EntityCard } from "@/components/ui/EntityCard";
import { Media } from "@/components/ui/Media";
import { SectionHeader } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getByKind, hrefFor } from "@/lib/content/repository";
import { STATUS_META } from "@/lib/ui-meta";
import { cn } from "@/lib/cn";
import { slotMedia } from "@/lib/site-media";

const EXAMPLE_QUESTIONS = [
  "Where is the crashed saucer?",
  "How do I unlock the Vortex GT?",
  "Stuck on Low Tide — how do I avoid the guards?",
  "Fastest early money",
  "Show me secrets in Grassrivers",
];

export default function HomePage() {
  const locations = getByKind("location");
  // Newest record of each module, so the row shows the breadth of the knowledge base.
  const latest = (["easter-egg", "mission", "unlock", "money"] as const)
    .map((k) => [...getByKind(k)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0])
    .filter(Boolean);

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <Media
          media={slotMedia("hero", "skyline", 11)}
          priority
          className="absolute inset-0 -z-10 h-full w-full opacity-80 [&_img]:object-[50%_70%]"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink-950/30 via-ink-950/55 to-ink-950" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_40%,transparent,rgb(6_5_10/0.6))]" />
        <div className="container-page pb-10 pt-10 sm:pb-14 sm:pt-16 lg:pb-20 lg:pt-24">
          <p className="eyebrow animate-fade-up text-violet-300/80">Unofficial GTA VI companion</p>
          <h1 className="h-display mt-3 max-w-3xl animate-fade-up text-balance text-[40px] leading-[1.02] [animation-delay:60ms] sm:text-6xl lg:text-7xl">
            <span className="italic">Find anything.</span>{" "}
            <span className="bg-gradient-to-r from-violet-300 via-violet-400 to-rose-400 bg-clip-text italic text-transparent">Get back to playing.</span>
          </h1>
          <p className="mt-4 max-w-xl animate-fade-up text-fg-muted [animation-delay:120ms] sm:text-lg">
            Search missions, unlocks, secrets and money intel — or scan a screenshot. Every answer shows how far you can trust it.
          </p>
          <HeroSearch className="mt-7 max-w-2xl animate-fade-up [animation-delay:180ms]" />
          <div className="mt-4 flex max-w-3xl flex-wrap gap-2 animate-fade-up [animation-delay:240ms]">
            {EXAMPLE_QUESTIONS.map((q) => (
              <Link key={q} href={`/search?q=${encodeURIComponent(q)}`} className="chip bg-ink-900/60 text-[13px] backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                {q}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Modules — bento */}
      <section aria-labelledby="modules" className="container-page">
        <h2 id="modules" className="sr-only">Modules</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:grid-rows-2">
          {MODULES.map((m, i) => {
            const Icon = m.icon;
            const layout = [
              "col-span-1 lg:col-span-2 lg:row-span-2",
              "col-span-1",
              "col-span-1",
              "col-span-1",
              "col-span-2 lg:col-span-1",
            ][i];
            return (
              <Link
                key={m.href}
                href={m.href}
                className={cn(
                  "group relative isolate flex min-h-[168px] flex-col justify-end overflow-hidden rounded-2xl border border-white/[0.08] p-4 shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-violet-500/40 hover:shadow-glow-sm sm:min-h-[200px] sm:p-5",
                  layout,
                  i === 0 && "lg:min-h-[420px]",
                )}
              >
                <Media media={slotMedia(m.slot, m.scene, m.seed)} className="absolute inset-0 -z-10 h-full w-full" priority={i < 2} />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950/95 via-ink-950/35 to-transparent" />
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl border border-violet-400/30 bg-ink-950/50 text-violet-300 backdrop-blur">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className={cn("font-display font-semibold", i === 0 ? "text-xl lg:text-2xl" : "text-[17px]")}>{m.label}</span>
                  <ArrowUpRight className="ml-auto h-4 w-4 text-fg-muted opacity-0 transition group-hover:opacity-100" />
                </div>
                <p className={cn("mt-2 text-sm text-fg-muted", i === 0 ? "block max-w-sm" : "hidden sm:block")}>{m.blurb}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <RecentlyViewed />

      {/* Explore Leonida (official) */}
      <section className="container-page mt-14">
        <SectionHeader eyebrow="From official pre-release material" title="Explore Leonida" href="/map" hrefLabel="Open map" icon={<MapPinned className="h-5 w-5 text-violet-400" />} />
        <ul className="mask-fade-x scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:gap-4">
          {locations.map((l) => (
            <li key={l.id} className="w-[72%] shrink-0 snap-start sm:w-[42%] lg:w-[23%]">
              <Link href={hrefFor(l)} className="group relative block overflow-hidden rounded-2xl border border-white/[0.08]">
                <Media media={l.media[0]} className="aspect-[4/5]" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
                <div className="absolute left-3 top-3">
                  <StatusBadge status={l.verification.status} short />
                </div>
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <h3 className="font-display text-lg font-semibold">{l.title}</h3>
                  <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{l.character}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Latest additions */}
      <section className="container-page mt-12">
        <SectionHeader eyebrow="Knowledge base" title="Latest additions" href="/explore" hrefLabel="Explore all" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {latest.map((e) => (
            <EntityCard key={e.id} e={e} />
          ))}
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="container-page mt-14">
        <div className="surface-raised grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <p className="eyebrow">Built on trust</p>
            <h2 className="h-display mt-2 flex items-center gap-2 text-2xl">
              <ShieldCheck className="h-6 w-6 text-status-verified" /> No made-up game facts.
            </h2>
            <p className="mt-2 text-sm text-fg-muted">
              Answers come only from VICE INTEL&apos;s source-backed knowledge base, and every record carries a status. When we don&apos;t know, we say so.
            </p>
            <Link href="/about" className="link-underline mt-3 inline-block text-sm text-violet-300">
              Sources &amp; methodology
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(["verified", "official", "estimate", "theory", "unverified", "demo"] as const).map((s) => (
              <li key={s} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-3">
                <StatusBadge status={s} size="sm" short />
                <span className="text-xs text-fg-muted">{STATUS_META[s].description}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
