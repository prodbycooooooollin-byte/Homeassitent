"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, MapPin } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  updateProjectStatusAction,
  addTaskAction,
  toggleTaskAction,
  addMaterialAction,
  updateMaterialProgressAction,
  deleteProjectAction,
} from "@/lib/actions/projects";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, DIMENSION_LABELS, type Dimension } from "@/lib/constants";
import { formatCoords } from "@/lib/format";
import type { ProjectWithDetails } from "@/lib/queries/projects";

export function ProjectCard({ project, canManage }: { project: ProjectWithDetails; canManage: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [newTask, setNewTask] = useState("");
  const [newMaterial, setNewMaterial] = useState({ name: "", needed: "" });

  function refresh() {
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{project.title}</CardTitle>
          <p className="text-xs text-ink-muted">von {project.createdByUser.displayName}</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage ? (
            <select
              value={project.status}
              onChange={(e) =>
                startTransition(async () => {
                  await updateProjectStatusAction(project.id, e.target.value);
                  refresh();
                })
              }
              className="rounded-lg border border-line bg-surface-raised px-2 py-1 text-xs text-ink"
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          ) : (
            <Badge tone="neutral">{PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS]}</Badge>
          )}
          {canManage && (
            <button
              onClick={() => startTransition(async () => { await deleteProjectAction(project.id); refresh(); })}
              className="text-ink-faint hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {project.description && <p className="text-sm text-ink-muted">{project.description}</p>}
        {project.dimension && project.x !== null && project.z !== null && (
          <p className="flex items-center gap-1.5 text-xs text-ink-faint">
            <MapPin size={12} />
            {DIMENSION_LABELS[project.dimension as Dimension]} {formatCoords(project.x, project.y, project.z!)}
          </p>
        )}

        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-muted">
            Aufgaben ({project.tasks.filter((t) => t.done).length}/{project.tasks.length})
          </p>
          <div className="space-y-1">
            {project.tasks.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => startTransition(async () => { await toggleTaskAction(t.id); refresh(); })}
                  className="accent-accent"
                />
                <span className={t.done ? "text-ink-faint line-through" : "text-ink"}>{t.title}</span>
              </label>
            ))}
          </div>
          {canManage && (
            <form
              action={() => {
                if (!newTask.trim()) return;
                startTransition(async () => {
                  await addTaskAction(project.id, newTask);
                  setNewTask("");
                  refresh();
                });
              }}
              className="mt-1.5 flex gap-1.5"
            >
              <input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Neue Aufgabe…"
                className="flex-1 rounded-lg border border-line bg-surface-raised px-2 py-1 text-xs text-ink"
              />
              <button type="submit" className="text-ink-muted hover:text-accent">
                <Plus size={16} />
              </button>
            </form>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-muted">Materialliste</p>
          <div className="space-y-1.5">
            {project.materials.map((m) => {
              const pct = Math.min(100, (m.gathered / m.needed) * 100);
              return (
                <div key={m.id} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 truncate text-ink">{m.itemName}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                  {canManage ? (
                    <input
                      type="number"
                      min={0}
                      defaultValue={m.gathered}
                      onBlur={(e) =>
                        startTransition(async () => {
                          await updateMaterialProgressAction(m.id, Number(e.target.value));
                          refresh();
                        })
                      }
                      className="w-14 rounded border border-line bg-surface-raised px-1 py-0.5 text-right text-ink"
                    />
                  ) : (
                    <span className="w-14 text-right text-ink-muted">{m.gathered}</span>
                  )}
                  <span className="text-ink-faint">/ {m.needed}</span>
                </div>
              );
            })}
          </div>
          {canManage && (
            <form
              action={() => {
                const needed = Number(newMaterial.needed);
                if (!newMaterial.name.trim() || !needed) return;
                startTransition(async () => {
                  await addMaterialAction(project.id, newMaterial.name, needed);
                  setNewMaterial({ name: "", needed: "" });
                  refresh();
                });
              }}
              className="mt-1.5 flex gap-1.5"
            >
              <input
                value={newMaterial.name}
                onChange={(e) => setNewMaterial((v) => ({ ...v, name: e.target.value }))}
                placeholder="Material…"
                className="flex-1 rounded-lg border border-line bg-surface-raised px-2 py-1 text-xs text-ink"
              />
              <input
                type="number"
                min={1}
                value={newMaterial.needed}
                onChange={(e) => setNewMaterial((v) => ({ ...v, needed: e.target.value }))}
                placeholder="Anzahl"
                className="w-20 rounded-lg border border-line bg-surface-raised px-2 py-1 text-xs text-ink"
              />
              <button type="submit" className="text-ink-muted hover:text-accent">
                <Plus size={16} />
              </button>
            </form>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
