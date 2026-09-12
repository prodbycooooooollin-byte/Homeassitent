"use client";

import { MousePointer2, MapPin, Pencil, Minus, Hexagon, Type, Check, X } from "lucide-react";
import { DIMENSIONS, DIMENSION_LABELS, type Dimension } from "@/lib/constants";
import type { MapMode } from "@/components/map/map-shell";
import { cn } from "@/lib/cn";

const TOOLS: { mode: MapMode; icon: typeof MousePointer2; label: string }[] = [
  { mode: "view", icon: MousePointer2, label: "Ansehen" },
  { mode: "place-marker", icon: MapPin, label: "Markierung" },
  { mode: "draw-freehand", icon: Pencil, label: "Freihand" },
  { mode: "draw-line", icon: Minus, label: "Strecke" },
  { mode: "draw-area", icon: Hexagon, label: "Fläche" },
  { mode: "draw-text", icon: Type, label: "Text" },
];

export function MapToolbar({
  dimension,
  onDimensionChange,
  mode,
  onModeChange,
  canEdit,
  color,
  onColorChange,
  areaInProgress,
  onFinishArea,
  onCancelDraw,
}: {
  dimension: Dimension;
  onDimensionChange: (d: Dimension) => void;
  mode: MapMode;
  onModeChange: (m: MapMode) => void;
  canEdit: boolean;
  color: string;
  onColorChange: (c: string) => void;
  areaInProgress: boolean;
  onFinishArea: () => void;
  onCancelDraw: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2">
      <div className="flex gap-1 rounded-lg bg-surface-raised p-0.5">
        {DIMENSIONS.map((d) => (
          <button
            key={d}
            onClick={() => onDimensionChange(d)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              dimension === d ? "bg-accent-strong text-[#04140a]" : "text-ink-muted hover:text-ink",
            )}
          >
            {DIMENSION_LABELS[d]}
          </button>
        ))}
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-1.5">
          {TOOLS.map((t) => (
            <button
              key={t.mode}
              onClick={() => onModeChange(t.mode)}
              title={t.label}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                mode === t.mode
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : "border-line text-ink-muted hover:bg-surface-raised",
              )}
            >
              <t.icon size={14} />
              <span className="hidden lg:inline">{t.label}</span>
            </button>
          ))}
          {mode.startsWith("draw") && (
            <input
              type="color"
              value={color}
              onChange={(e) => onColorChange(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded-lg border border-line bg-transparent p-0.5"
              title="Eigene Farbe"
            />
          )}
          {areaInProgress && (
            <button
              onClick={onFinishArea}
              className="flex items-center gap-1 rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-1.5 text-xs font-medium text-accent"
            >
              <Check size={14} /> Fertig
            </button>
          )}
          {mode !== "view" && (
            <button
              onClick={onCancelDraw}
              className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-raised"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
