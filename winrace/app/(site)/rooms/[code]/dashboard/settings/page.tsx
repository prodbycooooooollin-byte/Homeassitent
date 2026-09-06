"use client";

import { useState } from "react";
import { useRoomState } from "@/lib/client/room-state-context";
import { useAutosave } from "@/lib/hooks/use-autosave";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, HelpText } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import { ColorField } from "@/components/rooms/color-field";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast-context";
import { ShieldAlert } from "lucide-react";

export default function SettingsPage() {
  const { state, code, refetch } = useRoomState();
  const toast = useToast();
  const teamA = state.teams.find((t) => t.side === "A");
  const teamB = state.teams.find((t) => t.side === "B");

  const [form, setForm] = useState({
    name: state.room.name,
    logoUrl: state.room.logoUrl ?? "",
    teamAName: teamA?.name ?? "Team A",
    teamBName: teamB?.name ?? "Team B",
    teamAColor: teamA?.color ?? "#8b5cf6",
    teamBColor: teamB?.color ?? "#22d3ee",
    maxMembersPerTeam: state.room.maxMembersPerTeam,
    timeLimitMinutes: state.room.timeLimitMinutes ?? "",
    visibility: state.room.visibility,
    allowMemberProgress: state.room.allowMemberProgress,
    onlyTeamLeadEdits: state.room.onlyTeamLeadEdits,
    requireHostConfirmation: state.room.requireHostConfirmation,
    requireJoinApproval: state.room.requireJoinApproval,
  });
  const [newPassword, setNewPassword] = useState("");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const status = useAutosave(form, async (value) => {
    const res = await fetch(`/api/rooms/${code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...value, timeLimitMinutes: value.timeLimitMinutes ? Number(value.timeLimitMinutes) : null }),
    });
    if (!res.ok) throw new Error("Speichern fehlgeschlagen.");
    await refetch();
  });

  async function changePassword() {
    if (newPassword.length < 4) {
      toast.push({ variant: "error", title: "Passwort zu kurz", description: "Mindestens 4 Zeichen." });
      return;
    }
    const res = await fetch(`/api/rooms/${code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    if (res.ok) {
      toast.push({ variant: "success", title: "Passwort geändert" });
      setNewPassword("");
    } else {
      toast.push({ variant: "error", title: "Fehler beim Ändern des Passworts" });
    }
  }

  if (!state.viewer.permissions.canManageRoom) {
    return <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="Kein Zugriff" description="Nur der Host kann Raumeinstellungen ändern." />;
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Einstellungen</h2>
        <SaveStatusIndicator status={status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Grunddaten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Raumname</Label>
            <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="logoUrl">Event-Logo (URL)</Label>
            <Input id="logoUrl" value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} />
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
              <Label>Name Team A</Label>
              <Input value={form.teamAName} onChange={(e) => set("teamAName", e.target.value)} />
            </div>
            <ColorField label="Farbe Team A" value={form.teamAColor} onChange={(v) => set("teamAColor", v)} />
          </div>
          <div className="space-y-3">
            <div>
              <Label>Name Team B</Label>
              <Input value={form.teamBName} onChange={(e) => set("teamBName", e.target.value)} />
            </div>
            <ColorField label="Farbe Team B" value={form.teamBColor} onChange={(v) => set("teamBColor", v)} />
          </div>
          <div>
            <Label>Maximale Mitglieder pro Team</Label>
            <Input type="number" min={1} max={10} value={form.maxMembersPerTeam} onChange={(e) => set("maxMembersPerTeam", Number(e.target.value))} />
          </div>
          <div>
            <Label>Zeitlimit in Minuten</Label>
            <Input type="number" min={1} value={form.timeLimitMinutes} onChange={(e) => set("timeLimitMinutes", e.target.value)} placeholder="Kein Limit" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zugang & Berechtigungen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-ink">Zuschauerzugriff öffentlich</p>
              <p className="text-xs text-ink-faint">Live-Ansicht ohne Login für alle erreichbar.</p>
            </div>
            <Switch checked={form.visibility === "PUBLIC"} onChange={(v) => set("visibility", v ? "PUBLIC" : "PRIVATE")} />
          </div>
          <Switch checked={form.requireJoinApproval} onChange={(v) => set("requireJoinApproval", v)} label="Beitritt muss bestätigt werden" />
          <Switch checked={form.allowMemberProgress} onChange={(v) => set("allowMemberProgress", v)} label="Mitglieder dürfen Fortschritt aktualisieren" />
          <Switch checked={form.onlyTeamLeadEdits} onChange={(v) => set("onlyTeamLeadEdits", v)} label="Nur Team-Leads dürfen Änderungen durchführen" />
          <Switch checked={form.requireHostConfirmation} onChange={(v) => set("requireHostConfirmation", v)} label="Sieg muss von dir bestätigt werden" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Raum-Passwort ändern</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="newPassword">Neues Passwort</Label>
            <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <HelpText>Bereits erstellte Einladungslinks bleiben davon unberührt.</HelpText>
          </div>
          <Button variant="secondary" onClick={changePassword}>
            Passwort ändern
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
