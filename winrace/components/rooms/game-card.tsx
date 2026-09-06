"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Loader2, Pencil, Copy, Trash2, ChevronUp, ChevronDown, GripVertical, Star, Clock, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { ProgressControls } from "@/components/rooms/progress-controls";
import { useRoomState } from "@/lib/client/room-state-context";
import { useToast } from "@/components/ui/toast-context";
import { applicableGames } from "@/lib/client/derive";
import { GAME_STATUS_LABELS, APPLIES_TO_LABELS } from "@/lib/labels";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/cn";
import type { GameView } from "@/lib/types";

const STATUS_ICON = { PENDING: Circle, ACTIVE: Loader2, COMPLETED: CheckCircle2 } as const;

export function GameCard({
  game,
  index,
  total,
  onEdit,
  onEvidence,
  onMove,
  dragHandleProps,
}: {
  game: GameView;
  index: number;
  total: number;
  onEdit: () => void;
  onEvidence: (progressId: string) => void;
  onMove: (direction: -1 | 1) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const { state, code, refetch } = useRoomState();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const perms = state.viewer.permissions;

  const teams = state.teams.filter((t) => game.appliesTo === "BOTH" || game.appliesTo === `TEAM_${t.side}`);

  async function handleDelete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${code}/games/${game.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      await refetch();
    } catch (err) {
      toast.push({ variant: "error", title: "Löschen fehlgeschlagen", description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  async function handleDuplicate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${code}/games/${game.id}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      await refetch();
    } finally {
      setBusy(false);
    }
  }

  async function setCurrentGame(teamId: string, makeCurrent: boolean) {
    await fetch(`/api/rooms/${code}/teams/${teamId}/current-game`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: makeCurrent ? game.id : null }),
    });
    await refetch();
  }

  const allCompleted = teams.every((t) => game.progress[t.id]?.status === "COMPLETED");

  return (
    <Card className={cn("transition-opacity", allCompleted && "opacity-70")}>
      <div className="flex items-start gap-3 p-4 sm:p-5">
        {perms.canManageRoom && (
          <div className="flex flex-col items-center gap-1 pt-1">
            <button
              {...dragHandleProps}
              className="cursor-grab touch-none text-ink-faint hover:text-ink active:cursor-grabbing"
              aria-label="Ziehen zum Sortieren"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <button onClick={() => onMove(-1)} disabled={index === 0} className="text-ink-faint hover:text-ink disabled:opacity-30" aria-label="Nach oben">
              <ChevronUp className="h-4 w-4" />
            </button>
            <button onClick={() => onMove(1)} disabled={index === total - 1} className="text-ink-faint hover:text-ink disabled:opacity-30" aria-label="Nach unten">
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              {game.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={game.coverUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 text-ink-faint">#{game.order}</div>
              )}
              <div>
                <h3 className={cn("font-display font-semibold text-ink", allCompleted && "line-through decoration-2 text-ink-faint")}>{game.name}</h3>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
                  {game.appliesTo !== "BOTH" && <Badge className="bg-white/5 text-ink-muted">{APPLIES_TO_LABELS[game.appliesTo]}</Badge>}
                  {game.difficulty && (
                    <span className="inline-flex items-center gap-0.5">
                      {Array.from({ length: game.difficulty }).map((_, i) => (
                        <Star key={i} className="h-3 w-3 fill-warning text-warning" />
                      ))}
                    </span>
                  )}
                  {game.bonusPoints ? <span>+{game.bonusPoints} Bonus</span> : null}
                  {game.timeLimitMinutes && (
                    <span className="inline-flex items-center gap-0.5">
                      <Clock className="h-3 w-3" /> {game.timeLimitMinutes} Min.
                    </span>
                  )}
                  {game.requiresPreviousCompleted && (
                    <span className="inline-flex items-center gap-0.5">
                      <Lock className="h-3 w-3" /> Reihenfolge
                    </span>
                  )}
                </div>
              </div>
            </div>

            {perms.canManageRoom && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} loading={busy} aria-label="Bearbeiten">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDuplicate} loading={busy} aria-label="Duplizieren">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setConfirmDelete(true)} aria-label="Löschen">
                  <Trash2 className="h-3.5 w-3.5 text-danger" />
                </Button>
              </div>
            )}
          </div>

          {game.rulesText && <p className="text-xs text-ink-faint">{game.rulesText}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            {teams.map((team) => {
              const p = game.progress[team.id];
              const percent = game.targetValue > 0 ? ((p?.value ?? 0) / game.targetValue) * 100 : 0;
              const StatusIcon = STATUS_ICON[p?.status ?? "PENDING"];
              const canEdit = team.side === "A" ? perms.canUpdateTeamA : perms.canUpdateTeamB;
              const isCurrent = team.currentGameId === game.id;

              return (
                <div key={team.id} className="rounded-xl border border-base-border p-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: team.color }}>
                      <StatusIcon className={cn("h-3.5 w-3.5", p?.status === "ACTIVE" && "animate-spin")} />
                      {team.name}
                    </span>
                    <Badge className="bg-white/5 text-[10px] text-ink-faint">{GAME_STATUS_LABELS[p?.status ?? "PENDING"]}</Badge>
                  </div>
                  <ProgressBar percent={percent} color={team.color} />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <ProgressControls game={game} team={team} canEdit={canEdit} onAddEvidence={() => p && onEvidence(p.id)} />
                    {canEdit && !allCompleted && (
                      <button
                        onClick={() => setCurrentGame(team.id, !isCurrent)}
                        className={cn("text-xs font-medium", isCurrent ? "text-warning" : "text-ink-faint hover:text-ink")}
                        title="Als aktuelles Spiel markieren"
                      >
                        {isCurrent ? "★ Aktuell" : "☆ Als aktuell markieren"}
                      </button>
                    )}
                  </div>
                  {p?.lastUpdatedAt && (
                    <p className="mt-1.5 text-[11px] text-ink-faint">Zuletzt geändert {formatRelativeTime(new Date(p.lastUpdatedAt))}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title={`„${game.name}“ löschen?`}
        description="Der gesamte Fortschritt beider Teams für dieses Spiel geht dabei verloren."
        confirmLabel="Löschen"
        variant="danger"
        loading={busy}
      />
    </Card>
  );
}
