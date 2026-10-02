"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingsSection, SettingsRow, settingsFieldClasses } from "@/components/settings/settings-section";
import { DeviceRoomMapping } from "@/components/settings/device-room-mapping";
import { useApp } from "@/lib/state/app-context";
import { DEFAULT_SETTINGS } from "@/lib/state/settings";
import { QUICK_ACTION_LABELS, QUICK_ACTION_TYPES } from "@/lib/quick-action-meta";
import type { QuickActionType } from "@/lib/types";

export default function EinstellungenPage() {
  const { snapshot, loading, settings, updateSettings, connectionStatus } = useApp();
  const [houseName, setHouseName] = useState(settings.houseName);
  const [haUrl, setHaUrl] = useState(settings.haUrl);
  const [price, setPrice] = useState(settings.pricePerKwh.toString());
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => setHouseName(settings.houseName), [settings.houseName]);
  useEffect(() => setHaUrl(settings.haUrl), [settings.haUrl]);
  useEffect(() => setPrice(settings.pricePerKwh.toString()), [settings.pricePerKwh]);

  if (loading || !snapshot) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  function toggleQuickAction(type: QuickActionType, enabled: boolean) {
    const next = enabled
      ? [...settings.quickActionIds, type]
      : settings.quickActionIds.filter((t) => t !== type);
    updateSettings({ quickActionIds: next });
  }

  function commitPrice() {
    const value = parseFloat(price.replace(",", "."));
    if (!Number.isNaN(value) && value > 0) {
      updateSettings({ pricePerKwh: Math.round(value * 1000) / 1000 });
    } else {
      setPrice(settings.pricePerKwh.toString());
    }
  }

  return (
    <div className="space-y-5 pb-4">
      <PageHeader title="Einstellungen" description="Passe die App an dein Zuhause an." />

      <SettingsSection icon="home" title="Haus" description="Name, Einheit und Strompreis">
        <SettingsRow label="Name des Hauses">
          <input
            value={houseName}
            onChange={(e) => setHouseName(e.target.value)}
            onBlur={() => updateSettings({ houseName: houseName.trim() || DEFAULT_SETTINGS.houseName })}
            className={`${settingsFieldClasses} w-40 text-right`}
          />
        </SettingsRow>
        <SettingsRow label="Sprache">
          <select
            value={settings.language}
            onChange={(e) => updateSettings({ language: e.target.value as "de" | "en" })}
            className={settingsFieldClasses}
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </SettingsRow>
        <SettingsRow label="Währung">
          <select
            value={settings.currency}
            onChange={(e) => updateSettings({ currency: e.target.value as "EUR" | "USD" | "CHF" })}
            className={settingsFieldClasses}
          >
            <option value="EUR">Euro (€)</option>
            <option value="USD">US-Dollar ($)</option>
            <option value="CHF">Schweizer Franken (CHF)</option>
          </select>
        </SettingsRow>
        <SettingsRow label="Strompreis" description="Pro kWh, für Kostenschätzungen">
          <div className="flex items-center gap-2">
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={commitPrice}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              inputMode="decimal"
              className={`${settingsFieldClasses} w-20 text-right`}
            />
            <span className="text-xs text-ink-muted">€/kWh</span>
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection icon="sliders" title="Darstellung">
        <SettingsRow label="Dunkelmodus" description="Standard für ein ruhiges, technisches Erscheinungsbild">
          <Toggle
            checked={settings.theme === "dark"}
            onChange={(dark) => updateSettings({ theme: dark ? "dark" : "light" })}
            label="Dunkelmodus"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection icon="server" title="Home Assistant" description="Verbindung zu deiner Instanz">
        <SettingsRow label="Demo-Modus" description="Ohne echte Verbindung mit Beispieldaten arbeiten">
          <Toggle checked={settings.demoMode} onChange={(demo) => updateSettings({ demoMode: demo })} label="Demo-Modus" />
        </SettingsRow>
        <SettingsRow label="Verbindungsstatus">
          <Badge tone={connectionStatus === "connected" || connectionStatus === "demo" ? "good" : "bad"}>
            {connectionStatus === "demo" ? "Demo" : connectionStatus === "connected" ? "Verbunden" : connectionStatus === "connecting" ? "Verbindet…" : "Getrennt"}
          </Badge>
        </SettingsRow>
        {!settings.demoMode && (
          <SettingsRow label="Home-Assistant-Adresse" description="z. B. https://homeassistant.local:8123">
            <input
              value={haUrl}
              onChange={(e) => setHaUrl(e.target.value)}
              onBlur={() => updateSettings({ haUrl })}
              placeholder="https://…"
              className={`${settingsFieldClasses} w-56 text-right`}
            />
          </SettingsRow>
        )}
        {!settings.demoMode && (
          <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3 text-xs text-ink-muted">
            <Icon name="lock" size={14} className="mt-0.5 shrink-0 text-accent-strong" />
            <p>
              Das Zugriffstoken wird ausschließlich serverseitig über die Umgebungsvariablen{" "}
              <code className="rounded bg-surface-raised px-1 py-0.5 text-ink">HA_URL</code> und{" "}
              <code className="rounded bg-surface-raised px-1 py-0.5 text-ink">HA_TOKEN</code> konfiguriert und niemals
              im Browser gespeichert.
            </p>
          </div>
        )}
      </SettingsSection>

      <SettingsSection icon="sun" title="Solar & Batterie" description="Sichtbarkeit optionaler Funktionen">
        <SettingsRow label="Solaranlage anzeigen">
          <Toggle checked={settings.solarEnabled} onChange={(v) => updateSettings({ solarEnabled: v })} label="Solaranlage anzeigen" />
        </SettingsRow>
        <SettingsRow label="Batteriespeicher anzeigen">
          <Toggle checked={settings.batteryEnabled} onChange={(v) => updateSettings({ batteryEnabled: v })} label="Batteriespeicher anzeigen" />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection icon="zap" title="Schnellaktionen" description="Auswahl für die Startseite">
        {QUICK_ACTION_TYPES.map((type) => {
          const meta = QUICK_ACTION_LABELS[type];
          const enabled = settings.quickActionIds.includes(type);
          return (
            <SettingsRow key={type} label={meta.label}>
              <Toggle checked={enabled} onChange={(v) => toggleQuickAction(type, v)} label={meta.label} size="sm" />
            </SettingsRow>
          );
        })}
      </SettingsSection>

      <SettingsSection icon="layout-grid" title="Geräte-Zuordnung" description="Welchem Raum gehört welches Gerät?">
        <DeviceRoomMapping devices={snapshot.devices} rooms={snapshot.rooms} />
      </SettingsSection>

      <SettingsSection icon="bell" title="Benachrichtigungen">
        <SettingsRow label="Push- und In-App-Hinweise" description="Warnungen bei hohem Verbrauch, fertigen Geräten etc.">
          <Toggle
            checked={settings.notificationsEnabled}
            onChange={(v) => updateSettings({ notificationsEnabled: v })}
            label="Benachrichtigungen"
          />
        </SettingsRow>
      </SettingsSection>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setResetConfirmOpen(true)}>
          <Icon name="rotate-ccw" size={14} className="mr-1.5" />
          Auf Werkseinstellungen zurücksetzen
        </Button>
      </div>

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Einstellungen zurücksetzen?"
        description="Alle Anpassungen (Strompreis, Schnellaktionen, Sichtbarkeit etc.) werden auf die Standardwerte zurückgesetzt."
        confirmLabel="Zurücksetzen"
        tone="danger"
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={() => {
          updateSettings(DEFAULT_SETTINGS);
          setResetConfirmOpen(false);
        }}
      />
    </div>
  );
}
