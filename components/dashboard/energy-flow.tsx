"use client";

import { Icon } from "@/components/ui/icon";
import { formatWatt } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { HouseStatus } from "@/lib/types";

interface FlowNode {
  id: string;
  x: number; // 0-100
  y: number; // 0-100
  icon: string;
  label: string;
  value: string;
  tone: "accent" | "good" | "warn" | "neutral";
}

interface FlowLine {
  from: FlowNode;
  to: FlowNode;
  active: boolean;
  reverse: boolean;
  color: string;
}

const toneClasses: Record<FlowNode["tone"], string> = {
  accent: "bg-accent-soft text-accent-strong ring-accent/30",
  good: "bg-good-soft text-good ring-good/30",
  warn: "bg-warn-soft text-warn ring-warn/30",
  neutral: "bg-surface-raised text-ink-muted ring-line",
};

export function EnergyFlow({ status }: { status: HouseStatus }) {
  const hasSolar = status.solarPowerKw !== undefined;
  const hasBattery = status.batteryPercent !== undefined;
  const simplified = !hasSolar && !hasBattery;

  const grid: FlowNode = {
    id: "grid",
    x: 10,
    y: hasSolar || hasBattery ? 18 : 50,
    icon: "zap",
    label: "Stromnetz",
    value: `${status.gridPowerKw >= 0 ? "" : "+"}${formatWatt(Math.abs(status.gridPowerKw) * 1000)}`,
    tone: status.gridPowerKw >= 0 ? "accent" : "good",
  };
  const house: FlowNode = {
    id: "house",
    x: 50,
    y: 50,
    icon: "home",
    label: "Haus",
    value: formatWatt(status.currentPowerKw * 1000),
    tone: "accent",
  };
  const solar: FlowNode | null = hasSolar
    ? {
        id: "solar",
        x: 90,
        y: 18,
        icon: "sun",
        label: "Solaranlage",
        value: formatWatt((status.solarPowerKw ?? 0) * 1000),
        tone: "warn",
      }
    : null;
  const battery: FlowNode | null = hasBattery
    ? {
        id: "battery",
        x: 10,
        y: 82,
        icon: "battery-charging",
        label: `Batterie ${status.batteryPercent}%`,
        value: formatWatt(Math.abs(status.batteryPowerKw ?? 0) * 1000),
        tone: "good",
      }
    : null;
  const consumers: FlowNode = {
    id: "consumers",
    x: 90,
    y: 82,
    icon: "plug-zap",
    label: "Große Verbraucher",
    value: formatWatt(status.currentPowerKw * 1000 * 0.62),
    tone: "neutral",
  };

  const lines: FlowLine[] = [
    { from: grid, to: house, active: status.gridPowerKw !== 0, reverse: status.gridPowerKw < 0, color: "#3d8bfd" },
    { from: house, to: consumers, active: true, reverse: false, color: "#5f6c85" },
  ];
  if (solar) lines.push({ from: solar, to: house, active: (status.solarPowerKw ?? 0) > 0, reverse: false, color: "#f5a524" });
  if (battery) {
    const charging = (status.batteryPowerKw ?? 0) >= 0;
    lines.push({ from: house, to: battery, active: (status.batteryPowerKw ?? 0) !== 0, reverse: !charging, color: "#2fd681" });
  }

  const nodes = [grid, house, solar, battery, consumers].filter(Boolean) as FlowNode[];

  return (
    <div className="relative h-64 w-full sm:h-72">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {lines.map((line) => (
          <g key={`${line.from.id}-${line.to.id}`}>
            <line
              x1={line.from.x}
              y1={line.from.y}
              x2={line.to.x}
              y2={line.to.y}
              stroke={line.color}
              strokeOpacity={0.18}
              strokeWidth={0.6}
            />
            {line.active && (
              <line
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
                stroke={line.color}
                strokeWidth={0.9}
                strokeDasharray="3 4"
                strokeLinecap="round"
                className="animate-flow-dash"
                style={{ animationDirection: line.reverse ? "reverse" : "normal" }}
              />
            )}
          </g>
        ))}
      </svg>

      {nodes.map((node) => (
        <div
          key={node.id}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
        >
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full ring-1 sm:h-14 sm:w-14",
              toneClasses[node.tone],
              node.id === "house" && "h-14 w-14 shadow-glowAccent sm:h-16 sm:w-16",
            )}
          >
            <Icon name={node.icon} size={node.id === "house" ? 24 : 20} />
          </div>
          <div className="text-center leading-tight">
            <p className="whitespace-nowrap text-[0.65rem] font-medium text-ink sm:text-xs">{node.value}</p>
            <p className="whitespace-nowrap text-[0.6rem] text-ink-faint">{node.label}</p>
          </div>
        </div>
      ))}

      {simplified && (
        <p className="absolute bottom-0 right-0 text-[0.65rem] text-ink-faint">Vereinfachte Ansicht ohne PV/Batterie</p>
      )}
    </div>
  );
}
