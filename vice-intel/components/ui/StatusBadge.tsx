import { BadgeCheck, CircleHelp, FlaskConical, Lightbulb, Megaphone, MessageCircleWarning, Ruler } from "lucide-react";
import type { VerificationStatus } from "@/lib/content/schema";
import { STATUS_META } from "@/lib/ui-meta";
import { cn } from "@/lib/cn";

const ICONS: Record<VerificationStatus, typeof BadgeCheck> = {
  verified: BadgeCheck,
  official: Megaphone,
  estimate: Ruler,
  theory: Lightbulb,
  unverified: MessageCircleWarning,
  demo: FlaskConical,
  unknown: CircleHelp,
};

export function StatusBadge({
  status,
  size = "md",
  className,
  short,
}: {
  status: VerificationStatus;
  size?: "sm" | "md";
  className?: string;
  short?: boolean;
}) {
  const meta = STATUS_META[status];
  const Icon = ICONS[status];
  return (
    <span
      title={meta.description}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border font-medium backdrop-blur-md",
        meta.text,
        meta.bg,
        meta.border,
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
        className,
      )}
    >
      <Icon aria-hidden className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {short ? meta.short : meta.label}
    </span>
  );
}

export function KindBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-violet-500/40 bg-violet-500/15 px-2 py-1 text-xs font-medium text-violet-300 backdrop-blur-md",
        className,
      )}
    >
      {label}
    </span>
  );
}
