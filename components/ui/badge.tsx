import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

type Tone = "accent" | "gold" | "danger" | "info" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent border-accent/30",
  gold: "bg-gold-soft text-gold border-gold/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  info: "bg-info-soft text-info border-info/30",
  neutral: "bg-surface-raised text-ink-muted border-line",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}

export function LiveDot({ online }: { online: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {online && (
        <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-accent opacity-75" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          online ? "bg-accent" : "bg-ink-faint",
        )}
      />
    </span>
  );
}
