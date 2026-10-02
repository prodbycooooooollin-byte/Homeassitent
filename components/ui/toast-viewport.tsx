"use client";

import { useToast } from "@/lib/state/toast-context";
import { Icon } from "./icon";
import { cn } from "@/lib/cn";

const toneConfig = {
  success: { icon: "check-circle", classes: "border-good/30 bg-good-soft text-good" },
  error: { icon: "alert-triangle", classes: "border-bad/30 bg-bad-soft text-bad" },
  info: { icon: "shield-check", classes: "border-accent/30 bg-accent-soft text-accent-strong" },
} as const;

export function ToastViewport() {
  const { toasts, dismissToast } = useToast();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const config = toneConfig[toast.variant];
        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 shadow-card backdrop-blur-md animate-fade-in",
              "bg-surface-raised/95",
              config.classes,
            )}
          >
            <Icon name={config.icon} size={18} className="mt-0.5 shrink-0" />
            <p className="flex-1 text-sm text-ink">{toast.message}</p>
            <button
              onClick={() => dismissToast(toast.id)}
              aria-label="Meldung schließen"
              className="shrink-0 rounded-md p-0.5 text-ink-faint hover:text-ink"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
