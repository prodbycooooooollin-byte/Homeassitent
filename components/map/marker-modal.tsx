"use client";

import { useState } from "react";
import { MARKER_CATEGORIES, MARKER_CATEGORY_LABELS, VISIBILITIES, VISIBILITY_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import type { MarkerCategory, Visibility } from "@/lib/constants";

const inputClass =
  "w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export interface MarkerFormValues {
  title: string;
  description: string;
  category: MarkerCategory;
  visibility: Visibility;
}

export function MarkerModal({
  initial,
  coords,
  onSave,
  onClose,
}: {
  initial?: Partial<MarkerFormValues>;
  coords: { x: number; z: number };
  onSave: (values: MarkerFormValues) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState<MarkerCategory>(initial?.category ?? "OTHER");
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "SERVER");

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-panel border border-line bg-surface p-5 shadow-panel">
        <h3 className="mb-1 text-sm font-semibold text-ink">
          {initial ? "Markierung bearbeiten" : "Neue Markierung"}
        </h3>
        <p className="mb-3 text-xs text-ink-faint">
          Bei {Math.round(coords.x)}, {Math.round(coords.z)}
        </p>
        <div className="space-y-2.5">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titel"
            className={inputClass}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Beschreibung (optional)"
            rows={3}
            className={inputClass}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value as MarkerCategory)} className={inputClass}>
            {MARKER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {MARKER_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
            className={inputClass}
          >
            {VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {VISIBILITY_LABELS[v]}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            size="sm"
            disabled={!title.trim()}
            onClick={() => onSave({ title: title.trim(), description: description.trim(), category, visibility })}
          >
            Speichern
          </Button>
        </div>
      </div>
    </div>
  );
}
