"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea, FieldError } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { GameView } from "@/lib/types";

export interface GameFormValues {
  name: string;
  coverUrl: string;
  progressType: "WINS" | "POINTS" | "TASK";
  targetValue: number;
  timeLimitMinutes: string;
  rulesText: string;
  appliesTo: "BOTH" | "TEAM_A" | "TEAM_B";
  difficulty: string;
  bonusPoints: string;
  requireEvidence: boolean;
  requiresPreviousCompleted: boolean;
}

function toFormValues(game?: GameView | null): GameFormValues {
  return {
    name: game?.name ?? "",
    coverUrl: game?.coverUrl ?? "",
    progressType: game?.progressType ?? "WINS",
    targetValue: game?.targetValue ?? 1,
    timeLimitMinutes: game?.timeLimitMinutes?.toString() ?? "",
    rulesText: game?.rulesText ?? "",
    appliesTo: game?.appliesTo ?? "BOTH",
    difficulty: game?.difficulty?.toString() ?? "",
    bonusPoints: game?.bonusPoints?.toString() ?? "",
    requireEvidence: game?.requireEvidence ?? false,
    requiresPreviousCompleted: game?.requiresPreviousCompleted ?? false,
  };
}

export function GameFormDialog({
  open,
  onClose,
  onSubmit,
  initialGame,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: GameFormValues) => Promise<void>;
  initialGame?: GameView | null;
}) {
  const [values, setValues] = useState<GameFormValues>(toFormValues(initialGame));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setValues(toFormValues(initialGame));
  }, [open, initialGame]);

  function set<K extends keyof GameFormValues>(key: K, value: GameFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={initialGame ? "Spiel bearbeiten" : "Neues Spiel"}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="gname">Name</Label>
          <Input id="gname" required maxLength={80} value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="z.B. Fortnite" />
        </div>
        <div>
          <Label htmlFor="gcover">Cover/Icon (URL, optional)</Label>
          <Input id="gcover" value={values.coverUrl} onChange={(e) => set("coverUrl", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="gtype">Fortschrittsart</Label>
            <Select id="gtype" value={values.progressType} onChange={(e) => set("progressType", e.target.value as GameFormValues["progressType"])}>
              <option value="WINS">Siege</option>
              <option value="POINTS">Punkte</option>
              <option value="TASK">Erledigt-Aufgabe</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="gtarget">{values.progressType === "TASK" ? "Ziel (immer 1)" : "Benötigte Anzahl"}</Label>
            <Input
              id="gtarget"
              type="number"
              min={1}
              max={999}
              disabled={values.progressType === "TASK"}
              value={values.progressType === "TASK" ? 1 : values.targetValue}
              onChange={(e) => set("targetValue", Number(e.target.value))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="gapplies">Gültig für</Label>
            <Select id="gapplies" value={values.appliesTo} onChange={(e) => set("appliesTo", e.target.value as GameFormValues["appliesTo"])}>
              <option value="BOTH">Beide Teams</option>
              <option value="TEAM_A">Nur Team A</option>
              <option value="TEAM_B">Nur Team B</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="gtimelimit">Zeitlimit (Min., optional)</Label>
            <Input id="gtimelimit" type="number" min={1} value={values.timeLimitMinutes} onChange={(e) => set("timeLimitMinutes", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="gdiff">Schwierigkeit (1–5, optional)</Label>
            <Input id="gdiff" type="number" min={1} max={5} value={values.difficulty} onChange={(e) => set("difficulty", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="gbonus">Bonuspunkte (optional)</Label>
            <Input id="gbonus" type="number" min={0} value={values.bonusPoints} onChange={(e) => set("bonusPoints", e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="grules">Regelbeschreibung (optional)</Label>
          <Textarea id="grules" maxLength={500} value={values.rulesText} onChange={(e) => set("rulesText", e.target.value)} />
        </div>
        <Switch checked={values.requireEvidence} onChange={(v) => set("requireEvidence", v)} label="Beweis verpflichtend" description="z.B. Clip-Link oder Screenshot bei jedem Sieg." />
        <Switch
          checked={values.requiresPreviousCompleted}
          onChange={(v) => set("requiresPreviousCompleted", v)}
          label="Vorheriges Spiel muss abgeschlossen sein"
          description="Sonst ist freie Reihenfolge erlaubt."
        />
        <FieldError>{error}</FieldError>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" loading={loading}>
            {initialGame ? "Speichern" : "Hinzufügen"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
