"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { formatRelativeTime } from "@/lib/format";
import type { Hint } from "@/lib/types";
import { cn } from "@/lib/cn";

const severityTone = {
  info: "accent",
  warning: "warn",
  critical: "bad",
} as const;

export function NotificationsPopover({ hints }: { hints: Hint[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Benachrichtigungen${hints.length ? `, ${hints.length} neu` : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-raised text-ink-muted hover:bg-surface-hover hover:text-ink"
      >
        <Icon name="bell" size={18} />
        {hints.length > 0 && (
          <span className="absolute right-2 top-2 flex h-2 w-2 rounded-full bg-warn shadow-glowWarn" />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Benachrichtigungen"
          className={cn(
            "absolute right-0 z-50 mt-2 w-[calc(100vw-2rem)] max-w-sm animate-fade-in rounded-xl2 border border-line bg-surface-raised p-3 shadow-card",
          )}
        >
          <p className="mb-2 px-1 text-sm font-semibold text-ink">Benachrichtigungen</p>
          {hints.length === 0 ? (
            <p className="px-1 py-4 text-center text-xs text-ink-muted">Keine neuen Meldungen.</p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto">
              {hints.map((hint) => (
                <li key={hint.id} className="rounded-lg border border-line bg-surface p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Badge tone={severityTone[hint.severity]}>{hint.severity === "critical" ? "Kritisch" : hint.severity === "warning" ? "Hinweis" : "Info"}</Badge>
                    <span className="text-[0.65rem] text-ink-faint">{formatRelativeTime(hint.timestamp)}</span>
                  </div>
                  <p className="text-xs text-ink">{hint.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
