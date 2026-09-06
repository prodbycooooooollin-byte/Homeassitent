"use client";

import { useState } from "react";
import { Plus, Gamepad2 } from "lucide-react";
import { useRoomState } from "@/lib/client/room-state-context";
import { useToast } from "@/components/ui/toast-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GameCard } from "@/components/rooms/game-card";
import { GameFormDialog, type GameFormValues } from "@/components/rooms/game-form-dialog";
import { EvidenceDialog } from "@/components/rooms/evidence-dialog";
import type { GameView } from "@/lib/types";

function toPayload(values: GameFormValues) {
  return {
    name: values.name,
    coverUrl: values.coverUrl || undefined,
    progressType: values.progressType,
    targetValue: values.progressType === "TASK" ? 1 : values.targetValue,
    timeLimitMinutes: values.timeLimitMinutes ? Number(values.timeLimitMinutes) : undefined,
    rulesText: values.rulesText || undefined,
    appliesTo: values.appliesTo,
    difficulty: values.difficulty ? Number(values.difficulty) : undefined,
    bonusPoints: values.bonusPoints ? Number(values.bonusPoints) : undefined,
    requireEvidence: values.requireEvidence,
    requiresPreviousCompleted: values.requiresPreviousCompleted,
  };
}

export default function ChallengePage() {
  const { state, code, refetch } = useRoomState();
  const toast = useToast();
  const games = state.challenge?.games ?? [];
  const perms = state.viewer.permissions;

  const [formOpen, setFormOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<GameView | null>(null);
  const [evidenceProgressId, setEvidenceProgressId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  async function handleCreate(values: GameFormValues) {
    const res = await fetch(`/api/rooms/${code}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(values)),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Fehler beim Anlegen.");
    await refetch();
  }

  async function handleUpdate(values: GameFormValues) {
    if (!editingGame) return;
    const res = await fetch(`/api/rooms/${code}/games/${editingGame.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(values)),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Fehler beim Speichern.");
    await refetch();
  }

  async function reorder(orderedIds: string[]) {
    const res = await fetch(`/api/rooms/${code}/games/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });
    if (!res.ok) toast.push({ variant: "error", title: "Sortierung fehlgeschlagen" });
    await refetch();
  }

  function moveGame(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= games.length) return;
    const ids = games.map((g) => g.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder(ids);
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const ids = games.map((g) => g.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(targetIndex, 0, moved);
    setDragIndex(null);
    reorder(ids);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Spieleliste</h2>
        {perms.canManageRoom && (
          <Button
            size="sm"
            onClick={() => {
              setEditingGame(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Neues Spiel
          </Button>
        )}
      </div>

      {games.length === 0 ? (
        <EmptyState
          icon={<Gamepad2 className="h-8 w-8" />}
          title="Noch keine Spiele"
          description={perms.canManageRoom ? "Füge das erste Spiel hinzu, um die Challenge zu konfigurieren." : "Der Host hat noch keine Spiele hinzugefügt."}
          action={
            perms.canManageRoom && (
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" /> Spiel hinzufügen
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {games.map((game, index) => (
            <div
              key={game.id}
              draggable={perms.canManageRoom}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(index)}
            >
              <GameCard
                game={game}
                index={index}
                total={games.length}
                onEdit={() => {
                  setEditingGame(game);
                  setFormOpen(true);
                }}
                onEvidence={setEvidenceProgressId}
                onMove={(dir) => moveGame(index, dir)}
              />
            </div>
          ))}
        </div>
      )}

      <GameFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={editingGame ? handleUpdate : handleCreate}
        initialGame={editingGame}
      />
      <EvidenceDialog open={Boolean(evidenceProgressId)} onClose={() => setEvidenceProgressId(null)} progressId={evidenceProgressId} />
    </div>
  );
}
