"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/state/app-context";
import type { QuickAction, QuickActionType } from "@/lib/types";

const activeTone: Record<QuickActionType, string> = {
  waterheater: "bg-warn-soft text-warn ring-warn/40 shadow-glowWarn",
  heating: "bg-warn-soft text-warn ring-warn/40 shadow-glowWarn",
  lights: "bg-good-soft text-good ring-good/40 shadow-glowGood",
  outlets: "bg-good-soft text-good ring-good/40 shadow-glowGood",
  away: "bg-accent-soft text-accent-strong ring-accent/40 shadow-glowAccent",
  night: "bg-accent-soft text-accent-strong ring-accent/40 shadow-glowAccent",
  "all-off": "bg-bad-soft text-bad ring-bad/40 shadow-glowBad",
};

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  const { runQuickAction } = useApp();
  const [pending, setPending] = useState<QuickAction | null>(null);

  function handleClick(action: QuickAction) {
    if (action.requiresConfirm) {
      setPending(action);
      return;
    }
    void runQuickAction(action.id);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => handleClick(action)}
            aria-pressed={action.active}
            className={cn(
              "flex min-h-[5.5rem] flex-col items-start justify-between gap-3 rounded-xl2 border border-line bg-surface p-4 text-left transition-all duration-150 hover:border-line-strong active:scale-[0.98]",
              action.active && "ring-1",
              action.active && activeTone[action.type],
            )}
          >
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg",
                action.active ? "bg-white/10" : "bg-surface-raised text-ink-muted",
              )}
            >
              <Icon name={action.icon} size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">{action.label}</p>
              <p className="text-[0.7rem] text-ink-faint">{action.active ? "Aktiv" : "Inaktiv"}</p>
            </div>
          </button>
        ))}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={`${pending?.label} bestätigen`}
        description="Diese Aktion schaltet alle steuerbaren Geräte im Haus sofort aus. Fortfahren?"
        confirmLabel="Ja, alles ausschalten"
        tone="danger"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) void runQuickAction(pending.id);
          setPending(null);
        }}
      />
    </>
  );
}
