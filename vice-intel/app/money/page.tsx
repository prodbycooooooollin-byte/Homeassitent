import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { MoneyCompare } from "@/components/lists/MoneyCompare";
import { PageIntro } from "@/components/ui/PageIntro";
import { getByKind, hrefFor } from "@/lib/content/repository";

export const metadata: Metadata = { title: "Money Intel", description: "Compare documented ways to earn in-game money in GTA VI by payout, time, difficulty and progression." };

export default function MoneyPage() {
  const rows = getByKind("money").map((m) => ({
    id: m.id,
    title: m.title,
    href: hrefFor(m),
    summary: m.summary,
    type: m.activityType,
    payout: m.payout,
    duration: m.duration,
    difficulty: m.difficulty,
    repeatable: m.repeatable,
    progression: m.progression,
    startupCost: m.startupCost,
    status: m.verification.status,
    art: m.media[0].art,
    src: m.media[0].src,
  }));
  return (
    <>
      <PageIntro slot="money-header" title="Money Intel" eyebrow="Module 05" scene="vault" seed={405} icon={<Wallet className="h-6 w-6" />}>
        In-game cash only. Filter by what you can do right now, then compare payout against time. Values always show whether they&apos;re verified or estimated.
      </PageIntro>
      <div className="container-page mt-6">
        <MoneyCompare rows={rows} />
      </div>
    </>
  );
}
