"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Tv, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, HelpText, FieldError } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import { useAutosave } from "@/lib/hooks/use-autosave";
import { useToast } from "@/components/ui/toast-context";

interface ProfileFormProps {
  user: { displayName: string; email: string; avatarUrl: string | null; soundEnabled: boolean; reduceMotion: boolean };
  twitchLogin: string | null;
  twitchVerified: boolean;
}

export function ProfileForm({ user, twitchLogin, twitchVerified }: ProfileFormProps) {
  const { update: updateSession } = useSession();
  const toast = useToast();
  const [form, setForm] = useState({ displayName: user.displayName, avatarUrl: user.avatarUrl ?? "" });
  const [prefs, setPrefs] = useState({ soundEnabled: user.soundEnabled, reduceMotion: user.reduceMotion });
  const [twitchInput, setTwitchInput] = useState(twitchLogin ?? "");
  const [currentTwitch, setCurrentTwitch] = useState(twitchLogin);
  const [twitchVerifiedState, setTwitchVerifiedState] = useState(twitchVerified);
  const [twitchError, setTwitchError] = useState<string | null>(null);
  const [twitchLoading, setTwitchLoading] = useState(false);

  const profileStatus = useAutosave(form, async (value) => {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: value.displayName, avatarUrl: value.avatarUrl || undefined }),
    });
    if (!res.ok) throw new Error("Speichern fehlgeschlagen.");
    await updateSession();
  });

  const prefsStatus = useAutosave(prefs, async (value) => {
    const res = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
    if (!res.ok) throw new Error("Speichern fehlgeschlagen.");
  });

  async function linkTwitch() {
    setTwitchLoading(true);
    setTwitchError(null);
    try {
      const res = await fetch("/api/profile/twitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: twitchInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Konnte Kanal nicht verknüpfen.");
      setCurrentTwitch(data.twitchLogin);
      setTwitchVerifiedState(data.verified);
      toast.push({ variant: "success", title: "Twitch-Kanal verknüpft" });
    } catch (err) {
      setTwitchError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setTwitchLoading(false);
    }
  }

  async function unlinkTwitch() {
    setTwitchLoading(true);
    try {
      await fetch("/api/profile/twitch", { method: "DELETE" });
      setCurrentTwitch(null);
      setTwitchInput("");
    } finally {
      setTwitchLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <SaveStatusIndicator status={profileStatus} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>E-Mail</Label>
            <Input value={user.email} disabled />
          </div>
          <div>
            <Label htmlFor="displayName">Anzeigename</Label>
            <Input id="displayName" value={form.displayName} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="avatarUrl">Profilbild (URL)</Label>
            <Input id="avatarUrl" value={form.avatarUrl} onChange={(e) => setForm((p) => ({ ...p, avatarUrl: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Benachrichtigungen</CardTitle>
          <SaveStatusIndicator status={prefsStatus} />
        </CardHeader>
        <CardContent className="space-y-1">
          <Switch checked={prefs.soundEnabled} onChange={(v) => setPrefs((p) => ({ ...p, soundEnabled: v }))} label="Benachrichtigungstöne" description="Dezenter Ton bei wichtigen Ereignissen (Sieg, Führungswechsel, …)." />
          <Switch
            checked={prefs.reduceMotion}
            onChange={(v) => {
              setPrefs((p) => ({ ...p, reduceMotion: v }));
              document.documentElement.classList.toggle("reduce-motion", v);
            }}
            label="Animationen reduzieren"
            description="Zusätzlich zur Betriebssystem-Einstellung."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tv className="h-4 w-4 text-[#9146FF]" /> Twitch-Verknüpfung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {currentTwitch ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-base-border p-3">
              <div>
                <p className="text-sm font-medium text-ink">twitch.tv/{currentTwitch}</p>
                <p className="text-xs text-ink-faint">{twitchVerifiedState ? "Verifiziert über die Twitch-API" : "Nicht verifiziert (Twitch-API nicht konfiguriert)"}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={unlinkTwitch} loading={twitchLoading}>
                <Trash2 className="h-3.5 w-3.5 text-danger" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input placeholder="dein-twitch-name" value={twitchInput} onChange={(e) => setTwitchInput(e.target.value)} />
              <Button onClick={linkTwitch} loading={twitchLoading}>
                Verknüpfen
              </Button>
            </div>
          )}
          <FieldError>{twitchError}</FieldError>
          <HelpText>Wird in der Stream-Zentrale und auf Overlays für deine Raum-Mitgliedschaften verwendet.</HelpText>
        </CardContent>
      </Card>
    </div>
  );
}
