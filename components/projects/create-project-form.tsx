"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { createProjectAction } from "@/lib/actions/projects";
import { DIMENSIONS, DIMENSION_LABELS } from "@/lib/constants";

const inputClass =
  "w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function CreateProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus size={14} /> Neues Bauprojekt
      </Button>
    );
  }

  return (
    <Card>
      <CardBody>
        <form
          action={(fd) =>
            startTransition(async () => {
              const result = await createProjectAction(fd);
              if (!result.ok) setError(result.error ?? "Fehler.");
              else {
                setOpen(false);
                router.refresh();
              }
            })
          }
          className="space-y-2.5"
        >
          <input name="title" placeholder="Projekttitel" required className={inputClass} />
          <textarea name="description" placeholder="Beschreibung (optional)" rows={2} className={inputClass} />
          <div className="grid grid-cols-4 gap-2">
            <select name="dimension" className={inputClass}>
              <option value="">Dimension</option>
              {DIMENSIONS.map((d) => (
                <option key={d} value={d}>
                  {DIMENSION_LABELS[d]}
                </option>
              ))}
            </select>
            <input name="x" type="number" placeholder="X" className={inputClass} />
            <input name="y" type="number" placeholder="Y" className={inputClass} />
            <input name="z" type="number" placeholder="Z" className={inputClass} />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Erstellen
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
