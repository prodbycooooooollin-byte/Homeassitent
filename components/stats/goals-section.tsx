"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Target, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createGoalAction, deleteGoalAction } from "@/lib/actions/goals";
import { GOAL_METRICS, GOAL_METRIC_LABELS, type GoalMetric } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import type { GoalProgress } from "@/lib/stats/goals";

const inputClass =
  "w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function GoalsSection({
  goals,
  canManage,
  demoMode,
}: {
  goals: GoalProgress[];
  canManage: boolean;
  demoMode: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createGoalAction(formData);
      if (!result.ok) setError(result.error ?? "Fehler.");
      else setShowForm(false);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteGoalAction(id);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target size={15} /> Serverziele
        </CardTitle>
        {canManage && !demoMode && (
          <Button size="sm" variant="secondary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={13} /> Neues Ziel
          </Button>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {showForm && (
          <form action={submit} className="space-y-2 rounded-lg border border-line bg-surface-raised p-3">
            <input name="title" placeholder="Titel, z. B. „1 Million Blöcke abbauen“" required className={inputClass} />
            <textarea name="description" placeholder="Beschreibung (optional)" rows={2} className={inputClass} />
            <div className="flex gap-2">
              <select name="metric" className={inputClass}>
                {GOAL_METRICS.map((m: GoalMetric) => (
                  <option key={m} value={m}>
                    {GOAL_METRIC_LABELS[m]}
                  </option>
                ))}
              </select>
              <input name="target" type="number" min="1" placeholder="Ziel" required className={inputClass} />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <Button type="submit" size="sm" disabled={pending}>
              Erstellen
            </Button>
          </form>
        )}

        {goals.length === 0 ? (
          <p className="text-sm text-ink-muted">Noch keine Serverziele festgelegt.</p>
        ) : (
          goals.map((g) => {
            const pct = Math.min(100, (g.current / g.target) * 100);
            return (
              <div key={g.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{g.title}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-ink-muted">
                      {formatNumber(Math.round(g.current))} / {formatNumber(g.target)}{" "}
                      {g.metric === "PLAYTIME_HOURS" ? "Std." : ""}
                    </span>
                    {canManage && !demoMode && (
                      <button onClick={() => remove(g.id)} className="text-ink-faint hover:text-danger">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                {g.description && <p className="text-xs text-ink-faint">{g.description}</p>}
                <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className={`h-full rounded-full ${pct >= 100 ? "bg-gold" : "bg-accent"}`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardBody>
    </Card>
  );
}
