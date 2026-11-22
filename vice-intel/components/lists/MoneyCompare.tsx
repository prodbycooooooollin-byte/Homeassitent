"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, Clock, Repeat, Wallet } from "lucide-react";
import type { VerificationStatus } from "@/lib/content/schema";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { artUrl, formatMoney } from "@/lib/ui-meta";
import { cn } from "@/lib/cn";

export interface MoneyRow {
  id: string;
  title: string;
  href: string;
  summary: string;
  type: string;
  payout: { min: number; max: number; status: VerificationStatus };
  duration: { min: number; max: number; status: VerificationStatus };
  difficulty: "easy" | "medium" | "hard";
  repeatable: string;
  progression: "early" | "mid" | "late";
  startupCost: number;
  status: VerificationStatus;
  art?: { scene: string; seed: number };
}

const perHour = (r: MoneyRow) => ((r.payout.min + r.payout.max) / 2 / ((r.duration.min + r.duration.max) / 2)) * 60;

const SORTS = {
  rate: { label: "Best $/hour", fn: (a: MoneyRow, b: MoneyRow) => perHour(b) - perHour(a) },
  payout: { label: "Biggest payout", fn: (a: MoneyRow, b: MoneyRow) => b.payout.max - a.payout.max },
  time: { label: "Quickest", fn: (a: MoneyRow, b: MoneyRow) => a.duration.min - b.duration.min },
  cost: { label: "Lowest startup cost", fn: (a: MoneyRow, b: MoneyRow) => a.startupCost - b.startupCost },
} as const;

const BUDGETS = [
  { v: Infinity, label: "Any budget" },
  { v: 0, label: "No startup cost" },
  { v: 10_000, label: "≤ $10K" },
  { v: 100_000, label: "≤ $100K" },
];

export function MoneyCompare({ rows }: { rows: MoneyRow[] }) {
  const [progression, setProgression] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("");
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [budget, setBudget] = useState<number>(Infinity);
  const [sort, setSort] = useState<keyof typeof SORTS>("rate");

  const shown = useMemo(
    () =>
      rows
        .filter((r) => (!progression || r.progression === progression) && (!difficulty || r.difficulty === difficulty) && (!repeatOnly || r.repeatable !== "no") && r.startupCost <= budget)
        .sort(SORTS[sort].fn),
    [rows, progression, difficulty, repeatOnly, budget, sort],
  );
  const maxRate = Math.max(1, ...rows.map(perHour));

  const Chips = ({ value, set, options, label }: { value: string; set: (v: string) => void; options: string[]; label: string }) => (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="eyebrow mr-1">{label}</span>
      {["", ...options].map((o) => (
        <button key={o || "all"} type="button" aria-pressed={value === o} onClick={() => set(o)} className={cn("chip py-1 text-[13px] capitalize", value === o && "chip-active")}>
          {o || "All"}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <div className="surface space-y-3 p-4">
        <Chips label="Stage" value={progression} set={setProgression} options={["early", "mid", "late"]} />
        <Chips label="Difficulty" value={difficulty} set={setDifficulty} options={["easy", "medium", "hard"]} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1">Budget</span>
          {BUDGETS.map((b) => (
            <button key={b.label} type="button" aria-pressed={budget === b.v} onClick={() => setBudget(b.v)} className={cn("chip py-1 text-[13px]", budget === b.v && "chip-active")}>
              {b.label}
            </button>
          ))}
          <button type="button" aria-pressed={repeatOnly} onClick={() => setRepeatOnly((x) => !x)} className={cn("chip py-1 text-[13px]", repeatOnly && "chip-active")}>
            <Repeat className="h-3.5 w-3.5" /> Repeatable only
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-fg-muted" aria-live="polite">
          {shown.length} activit{shown.length === 1 ? "y" : "ies"}
        </p>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <ArrowDownWideNarrow className="h-4 w-4" />
          <span className="sr-only">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)} className="h-10 rounded-xl border border-white/10 bg-ink-900 px-2 text-fg focus:border-violet-500/50 focus:outline-none">
            {Object.entries(SORTS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="mt-3 space-y-3">
        {shown.map((r, i) => {
          const rate = perHour(r);
          return (
            <li key={r.id} className="animate-fade-up" style={{ animationDelay: `${i * 30}ms` }}>
              <Link href={r.href} className="group surface flex flex-col gap-4 overflow-hidden p-3 transition hover:border-violet-500/30 sm:flex-row sm:items-center">
                <span className="relative h-28 w-full shrink-0 overflow-hidden rounded-xl bg-ink-700 sm:h-24 sm:w-36">
                  {r.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={artUrl(r.art.scene, r.art.seed)} alt="" loading="lazy" className="zoom-on-hover h-full w-full object-cover" />
                  ) : null}
                  {i === 0 ? <span className="absolute left-2 top-2 rounded-md bg-violet-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Top pick</span> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[17px] font-semibold">{r.title}</span>
                    <StatusBadge status={r.status} size="sm" short />
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-fg-muted">{r.summary}</span>
                  <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-faint">
                    <span className="capitalize">{r.type.replace("-", " ")}</span>
                    <span className="capitalize">{r.progression} game</span>
                    <span className="capitalize">{r.difficulty}</span>
                    <span className="capitalize">Repeat: {r.repeatable}</span>
                    {r.startupCost ? <span>Startup {formatMoney(r.startupCost)}</span> : <span>No startup cost</span>}
                  </span>
                </span>
                <span className="grid shrink-0 grid-cols-3 gap-3 text-sm sm:w-[300px]">
                  <span>
                    <span className="flex items-center gap-1 text-[11px] text-fg-faint"><Wallet className="h-3 w-3" /> Payout</span>
                    <span className="font-semibold">{formatMoney(r.payout.min)}–{formatMoney(r.payout.max)}</span>
                  </span>
                  <span>
                    <span className="flex items-center gap-1 text-[11px] text-fg-faint"><Clock className="h-3 w-3" /> Time</span>
                    <span className="font-semibold">{r.duration.min}–{r.duration.max}m</span>
                  </span>
                  <span>
                    <span className="text-[11px] text-fg-faint">≈ per hour</span>
                    <span className="block font-semibold text-violet-300">{formatMoney(Math.round(rate))}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10">
                      <span className="block h-full rounded-full bg-gradient-to-r from-violet-500 to-rose-400" style={{ width: `${(rate / maxRate) * 100}%` }} />
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 ? <div className="surface mt-3 p-10 text-center text-sm text-fg-muted">No activities match. Loosen a filter.</div> : null}
      <p className="mt-4 text-xs text-fg-faint">
        “Per hour” is a rough midpoint calculation (average payout ÷ average duration) and inherits the status of the underlying values. It ignores cooldowns and travel time.
      </p>
    </div>
  );
}
