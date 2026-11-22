"use client";
import { useState } from "react";
import { AlertTriangle, LifeBuoy, Route, Sparkles } from "lucide-react";
import type { Mission } from "@/lib/content/schema";
import { StepList } from "@/components/detail/StepList";
import { Spoiler } from "@/components/detail/Spoiler";
import { AskPanel } from "@/components/search/AskPanel";
import { cn } from "@/lib/cn";

/**
 * Contextual mission help: the player picks the objective they're on and sees
 * only what matters there — steps, failure points, alternatives — plus a
 * focused AI helper scoped to this mission and objective.
 */
export function ObjectiveHelper({ mission }: { mission: Pick<Mission, "id" | "title" | "objectives"> }) {
  const [sel, setSel] = useState(mission.objectives[0].id);
  const [askOpen, setAskOpen] = useState(false);
  const obj = mission.objectives.find((o) => o.id === sel)!;
  const idx = mission.objectives.indexOf(obj);

  const body = (
    <div className="mt-4 space-y-4">
      <StepList steps={obj.steps} />
      {obj.failurePoints.length ? (
        <div className="rounded-xl border border-status-unverified/25 bg-status-unverified/[0.07] p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-status-unverified">
            <AlertTriangle className="h-4 w-4" /> Where players fail
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-fg/85">
            {obj.failurePoints.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {obj.alternatives.length ? (
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.07] p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-violet-300">
            <Route className="h-4 w-4" /> Alternative approach
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-fg/85">
            {obj.alternatives.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  return (
    <section id="stuck" className="surface-raised p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-5 w-5 text-violet-400" />
        <h2 className="font-display text-lg font-semibold">Where are you stuck?</h2>
      </div>
      <p className="mt-1 text-sm text-fg-muted">Pick your current objective — you&apos;ll only see what matters right now.</p>

      <div role="tablist" aria-label="Objectives" className="mt-4 grid gap-2 sm:grid-cols-3">
        {mission.objectives.map((o, i) => (
          <button
            key={o.id}
            role="tab"
            aria-selected={o.id === sel}
            onClick={() => {
              setSel(o.id);
              setAskOpen(false);
            }}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border p-2.5 text-left text-sm transition",
              o.id === sel ? "border-violet-400/70 bg-violet-500/15 shadow-glow-sm" : "border-white/[0.08] bg-ink-900/60 hover:border-violet-500/30",
            )}
          >
            <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold", o.id === sel ? "bg-violet-500 text-white" : "bg-white/10 text-fg-muted")}>{i + 1}</span>
            <span className={cn("min-w-0 leading-snug", o.spoiler && o.id !== sel && "blur-[3px]")}>{o.title}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={obj.title}>
        <p className="eyebrow mt-5">
          Objective {idx + 1} of {mission.objectives.length}
        </p>
        {obj.spoiler ? <Spoiler label="objective">{body}</Spoiler> : body}
      </div>

      <div className="mt-5">
        {askOpen ? (
          <AskPanel compact query={`I'm stuck at "${obj.title}" in the mission "${mission.title}". What should I do?`} context={{ entityId: mission.id, objectiveId: obj.id }} />
        ) : (
          <button
            type="button"
            onClick={() => setAskOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 font-semibold text-white shadow-glow-sm transition hover:bg-violet-400"
          >
            <Sparkles className="h-4 w-4" /> Still stuck? Ask Intel about this objective
          </button>
        )}
      </div>
    </section>
  );
}
