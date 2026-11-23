import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Panel } from "@/components/ui/Section";
import { sources } from "@/content/sources";
import { statusCounts } from "@/lib/content/repository";
import { VERIFICATION_STATUSES } from "@/lib/content/schema";
import { STATUS_META } from "@/lib/ui-meta";

export const metadata: Metadata = { title: "Sources & trust", description: "How VICE INTEL sources, verifies and labels GTA VI information." };

export default function AboutPage() {
  const counts = statusCounts();
  return (
    <div className="container-page max-w-4xl pt-8">
      <p className="eyebrow">About VICE INTEL</p>
      <h1 className="h-display mt-2 flex items-center gap-3 text-3xl sm:text-4xl">
        <ShieldCheck className="h-8 w-8 text-status-verified" /> Sources &amp; trust
      </h1>
      <p className="mt-3 text-fg-muted">
        VICE INTEL helps you solve problems in GTA VI fast. That only works if you can trust what you read, so every record carries a verification status and its sources —
        and the AI answers only from those records.
      </p>

      <Panel title="How we label intel" className="mt-8" >
        <div id="trust" className="grid gap-2 sm:grid-cols-2">
          {VERIFICATION_STATUSES.map((s) => (
            <div key={s} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-3">
              <StatusBadge status={s} size="sm" />
              <div className="text-sm">
                <p className="text-fg/90">{STATUS_META[s].description}</p>
                <p className="mt-1 text-xs text-fg-faint">{counts[s]} record{counts[s] === 1 ? "" : "s"} in this build</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="About this preview build" className="mt-5">
        <div className="space-y-3 text-sm text-fg/90">
          <p>
            Missions, unlocks, Easter eggs and money activities in this build are <strong>demo records</strong>: fictional examples that show how the product works.
            They are labelled <StatusBadge status="demo" size="sm" short /> everywhere and are excluded from search engines.
          </p>
          <p>
            Locations and characters marked <StatusBadge status="official" size="sm" short /> restate Rockstar Games&apos; official pre-release material only.
          </p>
          <p>
            All images are original illustrations generated for VICE INTEL. None are game screenshots, and none should be read as evidence of what the game contains.
            The map is a schematic illustration, not the in-game map.
          </p>
        </div>
      </Panel>

      <Panel title="How the AI works" className="mt-5">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-fg/90">
          <li>Your question is matched against the knowledge base first (typo-tolerant, intent-aware search).</li>
          <li>Only the matching records — with their statuses — are given to the model, which must cite them.</li>
          <li>If nothing matches, the AI is not asked and you&apos;re told so. If the AI is unavailable, you get an answer assembled directly from the records.</li>
          <li>Intel Scan never pretends: if recognition is unavailable or unsure, it says so and offers a manual search.</li>
          <li>Screenshots are analysed in memory and are not stored.</li>
        </ul>
      </Panel>

      <Panel title="Sources" className="mt-5">
        <ul className="space-y-2 text-sm">
          {sources.map((s) => (
            <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.05] pb-2 last:border-0">
              <span>
                {s.url ? (
                  <a className="link-underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                ) : (
                  s.title
                )}
                <span className="block text-xs text-fg-faint">{s.publisher}</span>
              </span>
              <span className="text-xs capitalize text-fg-faint">{s.kind}{s.publishedAt ? ` · ${s.publishedAt}` : ""}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Corrections" className="mt-5">
        <p id="corrections" className="text-sm text-fg/90">
          Found something wrong or missing? Corrections go through the content desk: an editor checks the claim against sources before a record changes status.
          See <Link className="link-underline text-violet-300" href="/admin">the content desk</Link> for the record format.
        </p>
      </Panel>

      <p className="mt-8 text-xs leading-relaxed text-fg-faint">
        VICE INTEL is an unofficial fan project. It is not affiliated with, endorsed or sponsored by Rockstar Games or Take-Two Interactive. Grand Theft Auto, GTA and
        related marks are trademarks of Take-Two Interactive Software, Inc.
      </p>
    </div>
  );
}
