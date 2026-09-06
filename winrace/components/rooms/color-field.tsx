"use client";

import { Label } from "@/components/ui/input";

const PRESETS = ["#8b5cf6", "#22d3ee", "#ef4444", "#f5a524", "#22c55e", "#ec4899", "#6366f1", "#14b8a6"];

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-base-border-strong" style={{ background: value }}>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-full w-full cursor-pointer opacity-0"
            aria-label={`${label} auswählen`}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              className="h-6 w-6 rounded-full ring-offset-2 ring-offset-base-card transition-shadow"
              style={{ background: preset, boxShadow: value.toLowerCase() === preset ? "0 0 0 2px white" : undefined }}
              aria-label={`Farbe ${preset}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
