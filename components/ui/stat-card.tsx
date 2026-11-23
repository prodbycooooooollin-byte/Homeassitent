import { Icon } from "./icon";
import { cn } from "@/lib/cn";

type Tone = "accent" | "good" | "warn" | "bad" | "neutral";

const toneClasses: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent-strong",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-surface-raised text-ink-muted",
};

export function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
  trend,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  trend?: { direction: "up" | "down"; label: string };
}) {
  return (
    <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", toneClasses[tone])}>
          <Icon name={icon} size={17} />
        </div>
        {trend && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-[0.7rem] font-medium",
              trend.direction === "up" ? "text-warn" : "text-good",
            )}
          >
            <Icon name={trend.direction === "up" ? "trending-up" : "trending-down"} size={12} />
            {trend.label}
          </span>
        )}
      </div>
      <p className="text-[1.35rem] font-semibold leading-tight text-ink sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{label}</p>
      {sub && <p className="mt-1 text-[0.7rem] text-ink-faint">{sub}</p>}
    </div>
  );
}
