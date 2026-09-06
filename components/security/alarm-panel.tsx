"use client";

import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { useApp } from "@/lib/state/app-context";
import type { AlarmMode } from "@/lib/types";
import { cn } from "@/lib/cn";

const MODE_OPTIONS: { value: AlarmMode; label: string }[] = [
  { value: "disarmed", label: "Deaktiviert" },
  { value: "home", label: "Zuhause" },
  { value: "away", label: "Abwesend" },
  { value: "night", label: "Nacht" },
];

const MODE_TONE: Record<AlarmMode, string> = {
  disarmed: "bg-surface-raised text-ink-muted",
  home: "bg-good-soft text-good",
  away: "bg-accent-soft text-accent-strong",
  night: "bg-warn-soft text-warn",
};

export function AlarmPanel({ mode }: { mode: AlarmMode }) {
  const { setAlarmMode } = useApp();

  return (
    <div className="rounded-xl2 border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className={cn("flex h-12 w-12 items-center justify-center rounded-xl", MODE_TONE[mode])}>
          <Icon name="shield" size={22} />
        </span>
        <div>
          <h3 className="text-base font-semibold text-ink">Alarmmodus</h3>
          <p className="text-xs text-ink-muted">
            Aktuell: {MODE_OPTIONS.find((m) => m.value === mode)?.label ?? mode}
          </p>
        </div>
      </div>
      <Segmented value={mode} onChange={(m) => void setAlarmMode(m)} options={MODE_OPTIONS} fullWidth />
    </div>
  );
}
