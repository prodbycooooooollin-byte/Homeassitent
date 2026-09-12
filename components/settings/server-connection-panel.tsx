"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Copy, KeyRound, Loader2, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SUPPORTED_SERVER_TARGETS,
  type SupportedServerTarget,
} from "@/lib/constants";
import {
  testSlpAction,
  testRconAction,
  saveServerConfigAction,
  generateAgentKeyAction,
  completeSetupAction,
} from "@/lib/actions/server-setup";
import { formatDateTime } from "@/lib/format";

export interface ServerConnectionData {
  id: string;
  name: string;
  host: string;
  port: number;
  minecraftVersion: string;
  platform: string;
  foundedAt: string | null; // ISO-Datum
  rconPort: number | null;
  hasRconPassword: boolean;
  setupCompletedAt: string | null;
  agentKeyGeneratedAt: string | null;
  lastAgentContactAt: string | null;
  reportedCapabilities: string[];
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function ServerConnectionPanel({ server }: { server: ServerConnectionData | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isNew = !server;
  const [step, setStep] = useState(1);

  const [name, setName] = useState(server?.name ?? "Unser Server");
  const [host, setHost] = useState(server?.host ?? "");
  const [port, setPort] = useState(String(server?.port ?? 25565));
  const [targetKey, setTargetKey] = useState(
    SUPPORTED_SERVER_TARGETS.findIndex(
      (t) => t.minecraftVersion === server?.minecraftVersion && t.platform === server?.platform,
    ) >= 0
      ? `${server!.minecraftVersion}/${server!.platform}`
      : `${SUPPORTED_SERVER_TARGETS[0].minecraftVersion}/${SUPPORTED_SERVER_TARGETS[0].platform}`,
  );
  const [foundedAt, setFoundedAt] = useState(server?.foundedAt?.slice(0, 10) ?? "");
  const [rconPort, setRconPort] = useState(server?.rconPort ? String(server.rconPort) : "");
  const [rconPassword, setRconPassword] = useState("");

  const [slpResult, setSlpResult] = useState<Awaited<ReturnType<typeof testSlpAction>> | null>(null);
  const [rconResult, setRconResult] = useState<Awaited<ReturnType<typeof testRconAction>> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [agentKey, setAgentKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedTarget: SupportedServerTarget =
    SUPPORTED_SERVER_TARGETS.find((t) => `${t.minecraftVersion}/${t.platform}` === targetKey) ??
    SUPPORTED_SERVER_TARGETS[0];

  function runSlpTest() {
    setSlpResult(null);
    startTransition(async () => {
      const result = await testSlpAction(host, Number(port) || 25565);
      setSlpResult(result);
    });
  }

  function runRconTest() {
    setRconResult(null);
    startTransition(async () => {
      const result = await testRconAction(host, Number(rconPort), rconPassword);
      setRconResult(result);
    });
  }

  function save() {
    setSaveError(null);
    startTransition(async () => {
      const result = await saveServerConfigAction({
        name,
        host,
        port,
        minecraftVersion: selectedTarget.minecraftVersion,
        platform: selectedTarget.platform,
        foundedAt: foundedAt || undefined,
        rconPort: rconPort || undefined,
        rconPassword: rconPassword || undefined,
      });
      if (!result.ok) {
        setSaveError(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setSaved(true);
      setRconPassword("");
      router.refresh();
    });
  }

  function finishSetup() {
    setSaveError(null);
    startTransition(async () => {
      const result = await completeSetupAction();
      if (!result.ok) {
        setSaveError(result.error ?? "Einrichtung konnte nicht abgeschlossen werden.");
        return;
      }
      router.refresh();
    });
  }

  function generateKey() {
    startTransition(async () => {
      const result = await generateAgentKeyAction();
      if (result.ok && result.key) setAgentKey(result.key);
    });
  }

  function copyKey() {
    if (!agentKey) return;
    navigator.clipboard?.writeText(agentKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const capabilities = server?.reportedCapabilities ?? [];
  const fullyConnected =
    !!server?.lastAgentContactAt &&
    Date.now() - new Date(server.lastAgentContactAt).getTime() < 10 * 60 * 1000;

  const steps = ["Server", "Version & Plattform", "Connector", "Testen & Abschließen"];

  const content = (
    <div className="space-y-5">
      {step === 1 && (
        <div className="space-y-3">
          <Field label="Servername">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Serveradresse" hint="Domain oder IP, ohne Port">
                <input
                  className={inputClass}
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="play.unserserver.de"
                />
              </Field>
            </div>
            <Field label="Port" hint="Standard: 25565">
              <input
                className={inputClass}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                inputMode="numeric"
                placeholder="25565"
              />
            </Field>
          </div>
          <Field label="Gründungsdatum" hint="Für das Serveralter auf der Übersicht (optional)">
            <input
              type="date"
              className={inputClass}
              value={foundedAt}
              onChange={(e) => setFoundedAt(e.target.value)}
            />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <Field label="Minecraft-Version & Plattform">
            <select
              className={inputClass}
              value={targetKey}
              onChange={(e) => setTargetKey(e.target.value)}
            >
              {SUPPORTED_SERVER_TARGETS.map((t) => (
                <option key={`${t.minecraftVersion}/${t.platform}`} value={`${t.minecraftVersion}/${t.platform}`}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="rounded-lg border border-info/30 bg-info-soft p-3 text-xs text-info">
            {selectedTarget.notes}
          </div>
          <p className="text-xs text-ink-faint">
            Craftboard behauptet bewusst keine Unterstützung für andere Versionen oder
            Modloader - weitere Kombinationen folgen, sobald sie geprüft sind.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface-raised p-3 text-sm text-ink-muted">
            <p className="mb-2 font-medium text-ink">Was muss installiert werden?</p>
            <p>
              Für vollständige Statistiken, Spielerlisten und Live-Positionen läuft auf dem
              Server-Rechner der <strong className="text-ink">Craftboard-Connector-Agent</strong>{" "}
              (Node.js-Skript im <code>connector/</code>-Ordner). Er liest die
              Statistikdateien und die Logdatei des Minecraft-Servers lokal und sendet
              periodisch verschlüsselt Zusammenfassungen an diese Website - Zugangsdaten
              verlassen den Server dabei nie. Genaue Schritte stehen in{" "}
              <code>connector/README.md</code>.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="RCON-Port (optional)" hint="Für Verbindungstest & Live-Befehle">
              <input
                className={inputClass}
                value={rconPort}
                onChange={(e) => setRconPort(e.target.value)}
                inputMode="numeric"
                placeholder="25575"
              />
            </Field>
            <Field
              label="RCON-Passwort"
              hint={server?.hasRconPassword ? "Gesetzt - leer lassen, um es zu behalten" : "aus server.properties"}
            >
              <input
                type="password"
                className={inputClass}
                value={rconPassword}
                onChange={(e) => setRconPassword(e.target.value)}
              />
            </Field>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line p-3">
              <p className="mb-2 text-xs font-medium text-ink-muted">Basis-Statusabfrage</p>
              <Button type="button" size="sm" variant="secondary" onClick={runSlpTest} disabled={pending || !host}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
                Verbindung testen
              </Button>
              {slpResult && (
                <div className="mt-2 text-xs">
                  {slpResult.ok ? (
                    <p className="text-accent">
                      ✓ Online - {slpResult.playersOnline}/{slpResult.playersMax} Spieler,{" "}
                      {slpResult.versionName}, {slpResult.latencyMs} ms
                    </p>
                  ) : (
                    <p className="text-danger">✗ {slpResult.error}</p>
                  )}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-line p-3">
              <p className="mb-2 text-xs font-medium text-ink-muted">RCON (optional)</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={runRconTest}
                disabled={pending || !host || !rconPort || !rconPassword}
              >
                {pending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                RCON testen
              </Button>
              {!rconPort && <p className="mt-2 text-xs text-ink-faint">Kein RCON konfiguriert.</p>}
              {rconResult && (
                <div className="mt-2 text-xs">
                  {rconResult.ok ? (
                    <p className="text-accent">✓ Verbunden - {rconResult.online} Spieler online</p>
                  ) : (
                    <p className="text-danger">✗ {rconResult.error}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {saveError && <p className="text-sm text-danger">{saveError}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={save} disabled={pending || !host}>
              {saved ? <Check size={14} /> : null} Speichern
            </Button>
            {saved && !server?.setupCompletedAt && (
              <Button type="button" variant="secondary" onClick={finishSetup} disabled={pending}>
                Einrichtung abschließen
              </Button>
            )}
          </div>

          {(saved || server) && (
            <div className="space-y-2 rounded-lg border border-line bg-surface-raised p-3">
              <p className="text-xs font-medium text-ink">Connector-Agent-Schlüssel</p>
              {agentKey ? (
                <>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 overflow-x-auto rounded bg-base px-2 py-1.5 text-xs text-accent">
                      {agentKey}
                    </code>
                    <Button type="button" size="sm" variant="secondary" onClick={copyKey}>
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                    </Button>
                  </div>
                  <p className="text-xs text-danger">
                    Wird nur einmal angezeigt - trage ihn jetzt in die Agent-Konfiguration
                    ein (<code>connector/config.json</code>, Feld <code>apiKey</code>).
                  </p>
                </>
              ) : (
                <>
                  {server?.agentKeyGeneratedAt && (
                    <p className="text-xs text-ink-muted">
                      Zuletzt erzeugt am {formatDateTime(server.agentKeyGeneratedAt)}. Ein neuer
                      Schlüssel macht den alten sofort ungültig.
                    </p>
                  )}
                  <Button type="button" size="sm" variant="secondary" onClick={generateKey} disabled={pending}>
                    <KeyRound size={13} />
                    {server?.agentKeyGeneratedAt ? "Neuen Schlüssel erzeugen" : "Schlüssel erzeugen"}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (isNew || !server?.setupCompletedAt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Einrichtungsassistent</CardTitle>
          <span className="text-xs text-ink-muted">
            Schritt {step} von {steps.length}
          </span>
        </CardHeader>
        <CardBody>
          <div className="mb-5 flex gap-1.5">
            {steps.map((label, i) => (
              <div
                key={label}
                className={`h-1 flex-1 rounded-full ${i + 1 <= step ? "bg-accent" : "bg-surface-raised"}`}
              />
            ))}
          </div>
          {content}
          <div className="mt-5 flex justify-between border-t border-line pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
            >
              <ChevronLeft size={14} /> Zurück
            </Button>
            {step < steps.length && (
              <Button type="button" onClick={() => setStep((s) => Math.min(steps.length, s + 1))}>
                Weiter <ChevronRight size={14} />
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Serververbindung</CardTitle>
        <Badge tone={fullyConnected ? "accent" : "info"}>
          {fullyConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {fullyConnected ? "Vollständig verbunden" : "Nur Basis-Status"}
        </Badge>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {(["statsFiles", "logTail", "rcon"] as const).map((cap) => (
            <div
              key={cap}
              className={`rounded-lg border px-2 py-1.5 text-center ${
                capabilities.includes(cap)
                  ? "border-accent/30 bg-accent-soft text-accent"
                  : "border-line text-ink-faint"
              }`}
            >
              {cap === "statsFiles" && "Statistiken"}
              {cap === "logTail" && "Live-Events"}
              {cap === "rcon" && "RCON"}
            </div>
          ))}
          <div className="rounded-lg border border-line px-2 py-1.5 text-center text-ink-muted">
            {server.lastAgentContactAt
              ? `Zuletzt: ${formatDateTime(server.lastAgentContactAt)}`
              : "Agent noch nie verbunden"}
          </div>
        </div>
        <div className="flex gap-1.5 border-b border-line pb-3">
          {steps.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(i + 1)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                step === i + 1
                  ? "bg-accent-soft text-accent"
                  : "text-ink-muted hover:bg-surface-raised hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {content}
      </CardBody>
    </Card>
  );
}
