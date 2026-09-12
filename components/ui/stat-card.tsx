import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  unavailable,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  /** Zeigt "Nicht verfügbar" statt eines erfundenen Werts. */
  unavailable?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          {label}
        </span>
        {Icon && <Icon size={16} className="text-accent/70" />}
      </div>
      {unavailable ? (
        <p className="mt-2 text-sm text-ink-faint">Nicht verfügbar</p>
      ) : (
        <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      )}
      {sub && !unavailable && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
    </Card>
  );
}
