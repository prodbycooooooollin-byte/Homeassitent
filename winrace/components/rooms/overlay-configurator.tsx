"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CopyButton } from "@/components/ui/copy-button";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import { useAutosave } from "@/lib/hooks/use-autosave";
import { useOrigin } from "@/lib/hooks/use-origin";
import { useRoomState } from "@/lib/client/room-state-context";
import { useToast } from "@/components/ui/toast-context";
import { OVERLAY_TYPE_LABELS, OVERLAY_TYPE_DESCRIPTIONS } from "@/lib/labels";
import { Ban, Plus, MonitorPlay } from "lucide-react";
import type { OverlayConfigInput } from "@/lib/validation";

const OVERLAY_TYPES = ["TEAM_COMPARISON", "TEAM_A", "TEAM_B", "COMPACT", "CURRENT_GAME", "FULL_LIST", "WINNER"] as const;

const DEFAULT_CONFIG: OverlayConfigInput = {
  showMemberAvatars: true,
  showLastActivity: true,
  showTimer: true,
  showAnimations: true,
  soundEnabled: false,
  compact: false,
  fontSize: "md",
  backgroundOpacity: 0,
  position: "top",
  accentMode: "team",
};

interface OverlayTokenRow {
  id: string;
  label: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function OverlayConfigurator() {
  const { code } = useRoomState();
  const origin = useOrigin();
  const toast = useToast();
  const [activeType, setActiveType] = useState<(typeof OVERLAY_TYPES)[number]>("TEAM_COMPARISON");
  const [config, setConfig] = useState<OverlayConfigInput>(DEFAULT_CONFIG);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [tokens, setTokens] = useState<OverlayTokenRow[]>([]);
  const [tokenLabel, setTokenLabel] = useState("");
  const [latestToken, setLatestToken] = useState<string | null>(null);
  const [creatingToken, setCreatingToken] = useState(false);

  async function loadConfig(type: string) {
    setLoadingConfig(true);
    const res = await fetch(`/api/rooms/${code}/overlay-config/${type}`);
    if (res.ok) setConfig((await res.json()).config);
    setLoadingConfig(false);
  }

  async function loadTokens() {
    const res = await fetch(`/api/rooms/${code}/overlay-tokens`);
    if (res.ok) setTokens((await res.json()).tokens);
  }

  useEffect(() => {
    loadConfig(activeType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType]);

  useEffect(() => {
    loadTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveStatus = useAutosave(config, async (value) => {
    const res = await fetch(`/api/rooms/${code}/overlay-config/${activeType}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    if (!res.ok) throw new Error("Speichern fehlgeschlagen.");
  });

  function set<K extends keyof OverlayConfigInput>(key: K, value: OverlayConfigInput[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function createToken() {
    setCreatingToken(true);
    try {
      const res = await fetch(`/api/rooms/${code}/overlay-tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: tokenLabel || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLatestToken(data.token);
      setTokenLabel("");
      await loadTokens();
    } catch (err) {
      toast.push({ variant: "error", title: "Konnte Token nicht erstellen", description: err instanceof Error ? err.message : undefined });
    } finally {
      setCreatingToken(false);
    }
  }

  async function revokeToken(id: string) {
    await fetch(`/api/rooms/${code}/overlay-tokens/${id}`, { method: "DELETE" });
    await loadTokens();
  }

  const previewToken = latestToken;
  const previewUrl = `${origin}/overlay/${code}/${activeType}${previewToken ? `?token=${previewToken}` : ""}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Overlay-Zugriffstoken</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-ink-faint">
            Ein Token gilt für alle 7 Overlay-Varianten dieses Raums. Widerrufe es jederzeit, ohne andere Links zu beeinträchtigen.
          </p>
          <div className="flex gap-2">
            <Input placeholder="Label, z.B. 'OBS Hauptrechner'" value={tokenLabel} onChange={(e) => setTokenLabel(e.target.value)} />
            <Button onClick={createToken} loading={creatingToken}>
              <Plus className="h-4 w-4" /> Token erstellen
            </Button>
          </div>
          {latestToken && (
            <div className="rounded-xl border border-brand/30 bg-brand/10 p-3">
              <p className="text-xs text-ink-faint">Neues Token (wird nur einmal angezeigt):</p>
              <p className="mt-1 break-all font-mono text-xs text-ink">{latestToken}</p>
            </div>
          )}
          <ul className="divide-y divide-base-border">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-ink">{t.label || "Ohne Label"}</span>
                {t.revokedAt ? (
                  <span className="text-xs text-ink-faint">Widerrufen</span>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => revokeToken(t.id)}>
                    <Ban className="h-3.5 w-3.5" /> Widerrufen
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-1.5">
          {OVERLAY_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                activeType === type ? "border-brand bg-brand/10 text-ink" : "border-base-border text-ink-faint hover:bg-base-card-hover"
              }`}
            >
              <p className="font-medium">{OVERLAY_TYPE_LABELS[type]}</p>
              <p className="text-xs text-ink-faint">{OVERLAY_TYPE_DESCRIPTIONS[type]}</p>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MonitorPlay className="h-4 w-4" /> Vorschau (16:9)
              </CardTitle>
              <SaveStatusIndicator status={saveStatus} />
            </CardHeader>
            <CardContent>
              <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-base-border bg-[repeating-conic-gradient(#1c1c2e_0%_25%,#111120_0%_50%)] bg-[length:24px_24px]">
                {!loadingConfig && (
                  <iframe key={`${activeType}-${previewToken}`} src={previewUrl} className="h-full w-full" title="Overlay-Vorschau" />
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <p className="flex-1 truncate text-xs text-ink-faint">{previewUrl}</p>
                <CopyButton value={previewUrl} label="URL kopieren" />
              </div>
              {!previewToken && <p className="mt-1 text-xs text-warning">Erstelle oben ein Token, um eine funktionierende URL zu erhalten (bei privaten Räumen erforderlich).</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Einstellungen · {OVERLAY_TYPE_LABELS[activeType]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Schriftgröße</Label>
                  <Select value={config.fontSize} onChange={(e) => set("fontSize", e.target.value as OverlayConfigInput["fontSize"])}>
                    <option value="sm">Klein</option>
                    <option value="md">Mittel</option>
                    <option value="lg">Groß</option>
                    <option value="xl">Sehr groß</option>
                  </Select>
                </div>
                <div>
                  <Label>Ausrichtung</Label>
                  <Select value={config.position} onChange={(e) => set("position", e.target.value as OverlayConfigInput["position"])}>
                    <option value="top">Oben</option>
                    <option value="bottom">Unten</option>
                    <option value="left">Links</option>
                    <option value="right">Rechts</option>
                    <option value="center">Zentriert</option>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Hintergrund-Deckkraft ({config.backgroundOpacity}%)</Label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={config.backgroundOpacity}
                    onChange={(e) => set("backgroundOpacity", Number(e.target.value))}
                    className="w-full accent-brand"
                  />
                </div>
              </div>
              <Switch checked={config.showMemberAvatars} onChange={(v) => set("showMemberAvatars", v)} label="Mitgliederbilder anzeigen" />
              <Switch checked={config.showTimer} onChange={(v) => set("showTimer", v)} label="Timer anzeigen" />
              <Switch checked={config.showAnimations} onChange={(v) => set("showAnimations", v)} label="Animationen aktivieren" />
              <Switch checked={config.soundEnabled} onChange={(v) => set("soundEnabled", v)} label="Soundeffekte aktivieren" description="Spielt einen Ton bei Abschluss/Sieg." />
              <Switch checked={config.compact} onChange={(v) => set("compact", v)} label="Kompakte Darstellung" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
