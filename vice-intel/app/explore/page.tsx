import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Map as MapIcon, Users } from "lucide-react";
import { MODULES } from "@/components/layout/nav";
import { Media } from "@/components/ui/Media";
import { EntityCard } from "@/components/ui/EntityCard";
import { SectionHeader } from "@/components/ui/Section";
import { getByKind } from "@/lib/content/repository";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  const counts: Record<string, number> = {
    "/missions": getByKind("mission").length,
    "/unlocks": getByKind("unlock").length,
    "/easter-eggs": getByKind("easter-egg").length,
    "/money": getByKind("money").length,
  };
  return (
    <div className="container-page pt-6">
      <h1 className="h-display text-3xl">Explore</h1>
      <p className="mt-1 text-fg-muted">All modules and the map in one place.</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {[...MODULES, { href: "/map", label: "Intel Map", blurb: "Search every place-based record", icon: MapIcon, scene: "keys" as const, seed: 23 }].map((m) => (
          <li key={m.href}>
            <Link href={m.href} className="group surface flex items-center gap-4 overflow-hidden p-2 pr-4 hover:border-violet-500/30">
              <Media media={{ alt: "", art: { scene: m.scene, seed: m.seed } }} className="h-20 w-28 shrink-0 rounded-xl" sizes="120px" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-display font-semibold">
                  <m.icon className="h-4 w-4 text-violet-400" /> {m.label}
                </span>
                <span className="block text-sm text-fg-muted">{m.blurb}</span>
                {counts[m.href] !== undefined ? <span className="text-xs text-fg-faint">{counts[m.href]} records</span> : null}
              </span>
              <ArrowRight className="h-4 w-4 text-fg-faint transition group-hover:translate-x-0.5 group-hover:text-fg" />
            </Link>
          </li>
        ))}
      </ul>
      <section className="mt-12">
        <SectionHeader title="Characters" eyebrow="Official pre-release" icon={<Users className="h-5 w-5 text-violet-400" />} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {getByKind("character").map((c) => (
            <EntityCard key={c.id} e={c} />
          ))}
        </div>
      </section>
    </div>
  );
}
