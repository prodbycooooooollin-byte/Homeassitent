import type { Step } from "@/lib/content/schema";
import { Media } from "@/components/ui/Media";
import { Spoiler } from "./Spoiler";

export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="relative space-y-3">
      {steps.map((s, i) => {
        const content = (
          <div className="flex gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-violet-400/50 font-display text-sm font-semibold text-violet-300 shadow-glow-sm">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.title}</p>
              <p className="mt-0.5 text-sm text-fg-muted">{s.detail}</p>
              {s.tip ? <p className="mt-1.5 text-xs text-violet-300">Tip: {s.tip}</p> : null}
            </div>
            {s.media ? <Media media={s.media} className="hidden h-16 w-24 shrink-0 rounded-lg sm:block" sizes="96px" /> : null}
          </div>
        );
        return <li key={s.id}>{s.spoiler ? <Spoiler label="Step">{content}</Spoiler> : content}</li>;
      })}
    </ol>
  );
}

