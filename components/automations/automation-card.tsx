import { Icon } from "@/components/ui/icon";
import { Toggle } from "@/components/ui/toggle";
import { formatRelativeTime } from "@/lib/format";
import { useApp } from "@/lib/state/app-context";
import type { Automation } from "@/lib/types";

export function AutomationCard({ automation }: { automation: Automation }) {
  const { setAutomationEnabled } = useApp();

  return (
    <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{automation.name}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{automation.description}</p>
        </div>
        <Toggle
          checked={automation.enabled}
          onChange={(next) => void setAutomationEnabled(automation.id, next)}
          label={`${automation.name} aktivieren`}
        />
      </div>

      <div className="space-y-1.5 text-xs">
        <p className="flex items-start gap-1.5 text-ink-muted">
          <Icon name="zap" size={13} className="mt-0.5 shrink-0 text-accent-strong" />
          <span>
            <span className="text-ink-faint">Wenn: </span>
            {automation.trigger}
          </span>
        </p>
        {automation.condition && (
          <p className="flex items-start gap-1.5 text-ink-muted">
            <Icon name="filter" size={13} className="mt-0.5 shrink-0 text-ink-faint" />
            <span>
              <span className="text-ink-faint">Bedingung: </span>
              {automation.condition}
            </span>
          </p>
        )}
        <p className="flex items-start gap-1.5 text-ink-muted">
          <Icon name="arrow-right" size={13} className="mt-0.5 shrink-0 text-good" />
          <span>
            <span className="text-ink-faint">Dann: </span>
            {automation.action}
          </span>
        </p>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[0.7rem] text-ink-faint">
        <Icon name="clock" size={12} />
        {automation.lastRun ? `Zuletzt ausgeführt ${formatRelativeTime(automation.lastRun)}` : "Noch nicht ausgeführt"}
      </p>
    </div>
  );
}
