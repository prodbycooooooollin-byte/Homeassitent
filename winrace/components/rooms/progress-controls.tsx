"use client";

import { useState } from "react";
import { Minus, Plus, Undo2, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-context";
import { useRoomState } from "@/lib/client/room-state-context";
import type { GameView, TeamView } from "@/lib/types";

interface ProgressControlsProps {
  game: GameView;
  team: TeamView;
  canEdit: boolean;
  onAddEvidence: () => void;
}

/** Ab dieser Schrittgröße wird vor dem Senden eine Sicherheitsabfrage angezeigt (größere Korrekturen). */
const CONFIRM_THRESHOLD = 3;

export function ProgressControls({ game, team, canEdit, onAddEvidence }: ProgressControlsProps) {
  const { code, state, patch, refetch } = useRoomState();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [confirmDelta, setConfirmDelta] = useState<number | null>(null);

  const progress = game.progress[team.id];
  const value = progress?.value ?? 0;
  const completed = progress?.status === "COMPLETED";
  const canDecrement = value > 0;
  const canIncrement = value < game.targetValue;
  const isTask = game.progressType === "TASK";

  async function applyDelta(delta: number) {
    if (pending) return;
    setPending(true);

    // Optimistisches Update; bei Fehler wird über refetch() sauber zurückgerollt.
    patch((prev) => ({
      ...prev,
      challenge: prev.challenge
        ? {
            ...prev.challenge,
            games: prev.challenge.games.map((g) =>
              g.id !== game.id
                ? g
                : {
                    ...g,
                    progress: {
                      ...g.progress,
                      [team.id]: {
                        ...g.progress[team.id],
                        value: Math.min(g.targetValue, Math.max(0, (g.progress[team.id]?.value ?? 0) + delta)),
                        status: Math.min(g.targetValue, Math.max(0, (g.progress[team.id]?.value ?? 0) + delta)) >= g.targetValue ? "COMPLETED" : "ACTIVE",
                      },
                    },
                  }
            ),
          }
        : null,
    }));

    try {
      const res = await fetch(`/api/rooms/${code}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id, gameId: game.id, delta }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Änderung fehlgeschlagen.");
    } catch (err) {
      toast.push({ variant: "error", title: "Konnte Fortschritt nicht ändern", description: err instanceof Error ? err.message : undefined });
      await refetch();
    } finally {
      setPending(false);
      setConfirmDelta(null);
    }
  }

  function handleClick(delta: number) {
    if (Math.abs(delta) >= CONFIRM_THRESHOLD) {
      setConfirmDelta(delta);
    } else {
      applyDelta(delta);
    }
  }

  if (!canEdit) {
    return null;
  }

  if (isTask) {
    return (
      <Button size="sm" variant={completed ? "secondary" : "primary"} onClick={() => applyDelta(completed ? -1 : 1)} loading={pending}>
        {completed ? "Zurücksetzen" : "Als erledigt markieren"}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button size="icon" variant="outline" className="h-8 w-8" disabled={!canDecrement} onClick={() => handleClick(-1)} loading={pending} aria-label="Minus 1">
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="w-12 text-center text-sm font-semibold tabular-nums text-ink">
        {value}/{game.targetValue}
      </span>
      <Button size="icon" variant="outline" className="h-8 w-8" disabled={!canIncrement} onClick={() => handleClick(1)} loading={pending} aria-label="Plus 1">
        <Plus className="h-3.5 w-3.5" />
      </Button>
      {game.requireEvidence && (
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onAddEvidence} aria-label="Beweis hinzufügen">
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </Button>
      )}

      <ConfirmDialog
        open={confirmDelta !== null}
        onClose={() => setConfirmDelta(null)}
        onConfirm={() => confirmDelta !== null && applyDelta(confirmDelta)}
        title="Größere Korrektur bestätigen"
        description={`${team.name}: ${confirmDelta && confirmDelta > 0 ? "+" : ""}${confirmDelta} bei „${game.name}“. Bist du sicher?`}
        confirmLabel="Bestätigen"
        loading={pending}
      />
    </div>
  );
}
