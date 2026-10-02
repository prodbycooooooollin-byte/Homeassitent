import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/format";
import type { Hint } from "@/lib/types";
import { cn } from "@/lib/cn";

const severityConfig = {
  info: { icon: "shield-check", classes: "bg-accent-soft text-accent-strong" },
  warning: { icon: "alert-triangle", classes: "bg-warn-soft text-warn" },
  critical: { icon: "alert-triangle", classes: "bg-bad-soft text-bad" },
} as const;

export function HintsCard({ hints }: { hints: Hint[] }) {
  if (hints.length === 0) {
    return <EmptyState icon="shield-check" title="Alles im grünen Bereich" description="Aktuell liegen keine Hinweise vor." />;
  }

  return (
    <ul className="space-y-2.5">
      {hints.map((hint) => {
        const config = severityConfig[hint.severity];
        return (
          <li key={hint.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface-raised p-3">
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", config.classes)}>
              <Icon name={config.icon} size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">{hint.message}</p>
              <p className="mt-0.5 text-[0.7rem] text-ink-faint">{formatRelativeTime(hint.timestamp)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
