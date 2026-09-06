"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, HelpText, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ColorField } from "@/components/rooms/color-field";

interface FormState {
  name: string;
  logoUrl: string;
  teamAName: string;
  teamBName: string;
  teamAColor: string;
  teamBColor: string;
  password: string;
  maxMembersPerTeam: number;
  startAt: string;
  timeLimitMinutes: string;
  visibility: "PUBLIC" | "PRIVATE";
  allowMemberProgress: boolean;
  onlyTeamLeadEdits: boolean;
  requireHostConfirmation: boolean;
  requireJoinApproval: boolean;
}

const initialState: FormState = {
  name: "",
  logoUrl: "",
  teamAName: "Team A",
  teamBName: "Team B",
  teamAColor: "#8b5cf6",
  teamBColor: "#22d3ee",
  password: "",
  maxMembersPerTeam: 4,
  startAt: "",
  timeLimitMinutes: "",
  visibility: "PRIVATE",
  allowMemberProgress: true,
  onlyTeamLeadEdits: false,
  requireHostConfirmation: true,
  requireJoinApproval: false,
};

export function CreateRoomForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          logoUrl: form.logoUrl || undefined,
          startAt: form.startAt ? new Date(form.startAt).toISOString() : undefined,
          timeLimitMinutes: form.timeLimitMinutes ? Number(form.timeLimitMinutes) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Raum konnte nicht erstellt werden.");
      router.push(`/rooms/${data.code}/dashboard?created=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Grunddaten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Raumname</Label>
            <Input id="name" required minLength={2} maxLength={60} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="z.B. Sommer-Showdown 2026" />
          </div>
          <div>
            <Label htmlFor="logoUrl">Event-Logo (optional, URL)</Label>
            <Input id="logoUrl" type="url" value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teams</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <div>
              <Label htmlFor="teamAName">Name Team A</Label>
              <Input id="teamAName" required maxLength={30} value={form.teamAName} onChange={(e) => set("teamAName", e.target.value)} />
            </div>
            <ColorField label="Farbe Team A" value={form.teamAColor} onChange={(v) => set("teamAColor", v)} />
          </div>
          <div className="space-y-3">
            <div>
              <Label htmlFor="teamBName">Name Team B</Label>
              <Input id="teamBName" required maxLength={30} value={form.teamBName} onChange={(e) => set("teamBName", e.target.value)} />
            </div>
            <ColorField label="Farbe Team B" value={form.teamBColor} onChange={(v) => set("teamBColor", v)} />
          </div>
          <div>
            <Label htmlFor="maxMembers">Maximale Mitglieder pro Team</Label>
            <Input id="maxMembers" type="number" min={1} max={10} value={form.maxMembersPerTeam} onChange={(e) => set("maxMembersPerTeam", Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zugang & Sicherheit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="password">Raum-Passwort</Label>
            <Input id="password" required minLength={4} value={form.password} onChange={(e) => set("password", e.target.value)} />
            <HelpText>Zusätzlich zum Raumcode nötig, um beizutreten – oder ein Einladungslink, den du danach erzeugen kannst.</HelpText>
          </div>
          <div>
            <Label htmlFor="visibility">Zuschauerzugriff</Label>
            <Select id="visibility" value={form.visibility} onChange={(e) => set("visibility", e.target.value as FormState["visibility"])}>
              <option value="PRIVATE">Privat (nur eingeladene Mitglieder)</option>
              <option value="PUBLIC">Öffentlich (Live-Ansicht für alle sichtbar)</option>
            </Select>
          </div>
          <Switch
            id="requireJoinApproval"
            checked={form.requireJoinApproval}
            onChange={(v) => set("requireJoinApproval", v)}
            label="Beitritt muss vom Host bestätigt werden"
            description="Neue Mitglieder landen zunächst als Anfrage in deiner Mitgliederverwaltung."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ablauf</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="startAt">Geplanter Start (optional)</Label>
            <Input id="startAt" type="datetime-local" value={form.startAt} onChange={(e) => set("startAt", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="timeLimit">Zeitlimit in Minuten (optional)</Label>
            <Input id="timeLimit" type="number" min={1} value={form.timeLimitMinutes} onChange={(e) => set("timeLimitMinutes", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Berechtigungen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Switch
            checked={form.allowMemberProgress}
            onChange={(v) => set("allowMemberProgress", v)}
            label="Mitglieder dürfen eigenen Fortschritt aktualisieren"
            description="Ist dies deaktiviert, können nur Team-Leads und du Fortschritt eintragen."
          />
          <Switch
            checked={form.onlyTeamLeadEdits}
            onChange={(v) => set("onlyTeamLeadEdits", v)}
            label="Nur Team-Leads dürfen Änderungen durchführen"
            description="Überschreibt die obere Einstellung – reguläre Mitglieder können dann nur zusehen."
          />
          <Switch
            checked={form.requireHostConfirmation}
            onChange={(v) => set("requireHostConfirmation", v)}
            label="Sieg muss von dir bestätigt werden"
            description="Empfohlen: verhindert versehentliche Beendigung bei knappen Ergebnissen."
          />
        </CardContent>
      </Card>

      <FieldError>{error}</FieldError>
      <Button type="submit" size="lg" className="w-full sm:w-auto" loading={loading}>
        Raum erstellen
      </Button>
    </form>
  );
}
