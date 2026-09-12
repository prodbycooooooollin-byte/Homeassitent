"use client";

import { useState, useTransition } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { createPortalAction, linkPortalsAction, deletePortalAction } from "@/lib/actions/portals";
import { formatCoords } from "@/lib/format";
import { DIMENSION_LABELS } from "@/lib/constants";
import type { PortalView } from "@/lib/queries/portals";

export function PortalsPanel({
  portals,
  dimension,
  canManage,
  onRefresh,
}: {
  portals: PortalView[];
  dimension: "OVERWORLD" | "NETHER" | "END";
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const relevant = portals.filter((p) => p.dimension === dimension);
  const unlinkedOthers = (excludeId: string) => portals.filter((p) => p.id !== excludeId && !p.linked);

  if (dimension === "END") {
    return <p className="text-xs text-ink-muted">Das End hat keine Portal-Paare wie Nether/Oberwelt.</p>;
  }

  return (
    <div className="space-y-3">
      {relevant.length === 0 && <p className="text-xs text-ink-muted">Noch keine Portale in dieser Dimension.</p>}
      {relevant.map((p) => (
        <div key={p.id} className="rounded-lg border border-line p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-ink">{p.name}</span>
            {canManage && (
              <button
                onClick={() => startTransition(async () => { await deletePortalAction(p.id); onRefresh(); })}
                className="text-ink-faint hover:text-danger"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
          <p className="text-ink-faint">{formatCoords(p.x, p.y, p.z)}</p>
          {p.linked ? (
            <p className="mt-1 text-accent">
              Verbunden mit {p.linked.name} ({DIMENSION_LABELS[p.linked.dimension as "OVERWORLD" | "NETHER"]})
            </p>
          ) : (
            <>
              <p className="mt-1 text-ink-muted">
                Berechnetes Ziel (nicht bestätigt): {DIMENSION_LABELS[p.calculatedTarget.dimension as "OVERWORLD" | "NETHER"]}{" "}
                {Math.round(p.calculatedTarget.x)}, {Math.round(p.calculatedTarget.z)}
              </p>
              {canManage && (
                <div className="mt-1">
                  {linkingId === p.id ? (
                    <select
                      autoFocus
                      onChange={(e) => {
                        if (!e.target.value) return;
                        startTransition(async () => {
                          await linkPortalsAction(p.id, e.target.value);
                          setLinkingId(null);
                          onRefresh();
                        });
                      }}
                      className="w-full rounded border border-line bg-surface-raised px-1 py-0.5 text-ink"
                    >
                      <option value="">Ziel wählen…</option>
                      {unlinkedOthers(p.id)
                        .filter((o) => o.dimension !== p.dimension)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} ({DIMENSION_LABELS[o.dimension]})
                          </option>
                        ))}
                    </select>
                  ) : (
                    <button
                      onClick={() => setLinkingId(p.id)}
                      className="flex items-center gap-1 text-accent hover:underline"
                      disabled={pending}
                    >
                      <Link2 size={11} /> Als verbunden markieren
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {canManage && (
        <form
          action={(fd) =>
            startTransition(async () => {
              setCreateError(null);
              fd.set("dimension", dimension);
              const result = await createPortalAction(fd);
              if (!result.ok) setCreateError(result.error ?? "Fehler beim Anlegen.");
              onRefresh();
            })
          }
          className="space-y-1.5 border-t border-line pt-2"
        >
          {createError && <p className="text-danger">{createError}</p>}
          <input name="name" placeholder="Portalname" required className="w-full rounded border border-line bg-surface-raised px-2 py-1 text-xs text-ink" />
          <div className="grid grid-cols-3 gap-1">
            <input name="x" type="number" placeholder="X" required className="rounded border border-line bg-surface-raised px-1.5 py-1 text-xs text-ink" />
            <input name="y" type="number" placeholder="Y" className="rounded border border-line bg-surface-raised px-1.5 py-1 text-xs text-ink" />
            <input name="z" type="number" placeholder="Z" required className="rounded border border-line bg-surface-raised px-1.5 py-1 text-xs text-ink" />
          </div>
          <button type="submit" className="flex items-center gap-1 text-xs text-accent hover:underline" disabled={pending}>
            <Plus size={12} /> Portal eintragen
          </button>
        </form>
      )}
    </div>
  );
}
