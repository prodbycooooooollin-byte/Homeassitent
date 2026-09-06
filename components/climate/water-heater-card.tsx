"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { ProgressRing } from "@/components/ui/progress-ring";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDuration, formatWatt } from "@/lib/format";
import { useApp } from "@/lib/state/app-context";
import type { WaterHeater } from "@/lib/types";

const TIMER_OPTIONS = [30, 60, 120];

export function WaterHeaterCard({ heater }: { heater: WaterHeater }) {
  const { setWaterHeaterPower, setWaterHeaterTimer, setWaterHeaterTarget } = useApp();
  const [confirmContinuous, setConfirmContinuous] = useState(false);

  function handleToggle(next: boolean) {
    if (next) {
      setConfirmContinuous(true);
    } else {
      void setWaterHeaterPower(false);
    }
  }

  function activateTimer(minutes: number) {
    void setWaterHeaterPower(true);
    void setWaterHeaterTimer(minutes);
  }

  const progress = Math.min(100, (heater.waterTemperature / heater.targetTemperature) * 100);

  return (
    <div className="rounded-xl2 border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-warn-soft text-warn">
            <Icon name="flame" size={20} />
          </span>
          <div>
            <h3 className="text-base font-semibold text-ink">Heizstab Warmwasser</h3>
            <p className="text-xs text-ink-muted">
              {heater.isOn ? `Aktiv · ${formatWatt(heater.currentPowerW)}` : "Ausgeschaltet"}
            </p>
          </div>
        </div>
        <Toggle checked={heater.isOn} onChange={handleToggle} label="Heizstab schalten" />
      </div>

      <div className="mb-5 flex items-center gap-5">
        <ProgressRing value={progress} size={84} strokeWidth={8} color="#f5a524">
          <div className="text-center">
            <p className="text-lg font-semibold text-ink">{heater.waterTemperature}°</p>
            <p className="text-[0.6rem] text-ink-faint">Ziel {heater.targetTemperature}°</p>
          </div>
        </ProgressRing>
        <div className="flex-1 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Betriebsdauer heute</span>
            <span className="font-medium text-ink">{formatDuration(heater.runtimeMinutesToday)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Status</span>
            <Badge tone={heater.isOn ? (heater.manualOverride ? "warn" : "good") : "neutral"}>
              {heater.isOn ? (heater.manualOverride ? "Dauerbetrieb" : heater.timerMinutesLeft ? `Timer: ${heater.timerMinutesLeft} Min.` : "Aktiv") : "Aus"}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-muted">Zieltemperatur</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => void setWaterHeaterTarget(Math.max(40, heater.targetTemperature - 1))}
                aria-label="Zieltemperatur senken"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface-raised hover:bg-surface-hover active:scale-95"
              >
                <Icon name="minus" size={14} />
              </button>
              <span className="w-10 text-center font-medium text-ink">{heater.targetTemperature}°</span>
              <button
                onClick={() => void setWaterHeaterTarget(Math.min(70, heater.targetTemperature + 1))}
                aria-label="Zieltemperatur erhöhen"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface-raised hover:bg-surface-hover active:scale-95"
              >
                <Icon name="plus" size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Timer</p>
      <div className="grid grid-cols-4 gap-2">
        {TIMER_OPTIONS.map((minutes) => (
          <button
            key={minutes}
            onClick={() => activateTimer(minutes)}
            className="flex h-11 items-center justify-center rounded-xl border border-line bg-surface-raised text-sm font-medium text-ink hover:bg-surface-hover active:scale-95"
          >
            {minutes} Min.
          </button>
        ))}
        <button
          onClick={() => setConfirmContinuous(true)}
          className="flex h-11 items-center justify-center rounded-xl border border-warn/30 bg-warn-soft text-sm font-medium text-warn hover:brightness-110 active:scale-95"
        >
          Dauer
        </button>
      </div>

      <ConfirmDialog
        open={confirmContinuous}
        title="Dauerbetrieb aktivieren?"
        description="Der Heizstab läuft ohne automatische Abschaltung, bis du ihn manuell wieder ausschaltest. Das kann den Stromverbrauch deutlich erhöhen."
        confirmLabel="Ja, dauerhaft einschalten"
        tone="danger"
        onCancel={() => setConfirmContinuous(false)}
        onConfirm={() => {
          void setWaterHeaterPower(true);
          void setWaterHeaterTimer(null);
          setConfirmContinuous(false);
        }}
      />
    </div>
  );
}
