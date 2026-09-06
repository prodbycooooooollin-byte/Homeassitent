"use client";

import { useState } from "react";
import { Play, Pause, PlayCircle, Flag, Archive, Trophy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-context";
import { useRoomState } from "@/lib/client/room-state-context";

type Action = "ready" | "start" | "pause" | "resume" | "end" | "confirm_winner" | "archive";

export function LifecycleControls() {
  const { state, code, refetch } = useRoomState();
  const toast = useToast();
  const [loading, setLoading] = useState<Action | null>(null);
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);

  const challenge = state.challenge;
  if (!challenge) return null;

  async function run(action: Action) {
    setLoading(action);
    try {
      const res = await fetch(`/api/rooms/${code}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Aktion fehlgeschlagen.");
      await refetch();
    } catch (err) {
      toast.push({ variant: "error", title: "Aktion fehlgeschlagen", description: err instanceof Error ? err.message : undefined });
    } finally {
      setLoading(null);
      setConfirmAction(null);
    }
  }

  const pendingTeam = challenge.pendingWinnerTeamId ? state.teams.find((t) => t.id === challenge.pendingWinnerTeamId) : null;

  return (
    <div className="space-y-3">
      {pendingTeam && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
          <div className="flex items-center gap-2 text-warning">
            <Trophy className="h-5 w-5" />
            <p className="text-sm font-medium">{pendingTeam.name} hat alle Spiele abgeschlossen und wartet auf deine Bestätigung.</p>
          </div>
          <Button variant="success" size="sm" onClick={() => run("confirm_winner")} loading={loading === "confirm_winner"}>
            <CheckCircle2 className="h-4 w-4" /> Sieg bestätigen
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {challenge.status === "LOBBY" && (
          <>
            <Button variant="secondary" onClick={() => run("ready")} loading={loading === "ready"}>
              Als bereit markieren
            </Button>
            <Button onClick={() => setConfirmAction("start")} loading={loading === "start"}>
              <Play className="h-4 w-4" /> Challenge starten
            </Button>
          </>
        )}
        {challenge.status === "READY" && (
          <Button onClick={() => setConfirmAction("start")} loading={loading === "start"}>
            <Play className="h-4 w-4" /> Challenge starten
          </Button>
        )}
        {challenge.status === "RUNNING" && (
          <>
            <Button variant="secondary" onClick={() => run("pause")} loading={loading === "pause"}>
              <Pause className="h-4 w-4" /> Pausieren
            </Button>
            <Button variant="danger" onClick={() => setConfirmAction("end")} loading={loading === "end"}>
              <Flag className="h-4 w-4" /> Challenge beenden
            </Button>
          </>
        )}
        {challenge.status === "PAUSED" && (
          <>
            <Button onClick={() => run("resume")} loading={loading === "resume"}>
              <PlayCircle className="h-4 w-4" /> Fortsetzen
            </Button>
            <Button variant="danger" onClick={() => setConfirmAction("end")} loading={loading === "end"}>
              <Flag className="h-4 w-4" /> Challenge beenden
            </Button>
          </>
        )}
        {challenge.status === "FINISHED" && (
          <Button variant="secondary" onClick={() => setConfirmAction("archive")} loading={loading === "archive"}>
            <Archive className="h-4 w-4" /> Raum archivieren
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmAction === "start"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => run("start")}
        title="Challenge jetzt starten?"
        description="Der gemeinsame Timer startet sofort und die Teams werden gesperrt. Das kannst du in den Einstellungen später wieder aufheben."
        confirmLabel="Starten"
        loading={loading === "start"}
      />
      <ConfirmDialog
        open={confirmAction === "end"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => run("end")}
        title="Challenge jetzt beenden?"
        description="Die Challenge wird ohne automatische Gewinner-Ermittlung sofort beendet. Diese Aktion lässt sich nicht rückgängig machen."
        confirmLabel="Beenden"
        variant="danger"
        loading={loading === "end"}
      />
      <ConfirmDialog
        open={confirmAction === "archive"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => run("archive")}
        title="Raum archivieren?"
        description="Der Raum wird ins Archiv verschoben und schreibgeschützt. Zuschauer- und Overlay-Links funktionieren weiterhin."
        confirmLabel="Archivieren"
        loading={loading === "archive"}
      />
    </div>
  );
}
