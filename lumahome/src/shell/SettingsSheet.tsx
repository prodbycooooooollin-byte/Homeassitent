// Einstellungen: Projekt, Export/Import, Grafik, Zugang.
import { Download, KeyRound, LogOut, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { useApp, logout, startLive } from "@/app/boot";
import { parseProjectFile, toProjectFile } from "@/model/schema";
import type { Project } from "@/model/types";
import { Dialog, Notice, NumberField, Segmented, TextField } from "@/ui/primitives";
import { useLive } from "@/store/live";
import { api } from "@/sources/live";

export function PinLogin() {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const toast = useUi((s) => s.toast);
  const submit = async () => {
    try {
      const r = await api<{ role: string }>("/api/session", { method: "POST", body: JSON.stringify({ pin }) });
      toast(r.role === "edit" ? "Angemeldet: Ansehen, Steuern und Bearbeiten." : "Angemeldet: Ansehen und Steuern.", "success");
      setPin("");
      setErr(null);
      await startLive();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex-1">
        <label className="label" htmlFor="pin">
          PIN
        </label>
        <input id="pin" className="input" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} />
      </div>
      <button className="btn-primary" type="submit" disabled={!pin}>
        <KeyRound size={16} /> Anmelden
      </button>
      {err && <p className="w-full text-xs text-danger">{err}</p>}
    </form>
  );
}

function WeatherSettings() {
  const project = useProject((s) => s.project)!;
  const apply = useProject((s) => s.apply);
  const canEdit = useProject((s) => s.canEdit);
  const states = useLive((s) => s.states);
  const weathers = Object.values(states).filter((s) => s.entity_id.startsWith("weather."));
  const set = (patch: Partial<typeof project.settings>) => apply((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  const hasSun = !!states["sun.sun"];
  return (
    <section className="space-y-3">
      <h3 className="section-title">Wetter & Sonne</h3>
      <div>
        <label className="label" htmlFor="weather-entity">
          Wetter-Entität
        </label>
        <select id="weather-entity" className="input" disabled={!canEdit} value={project.settings.weatherEntityId ?? ""} onChange={(e) => set({ weatherEntityId: e.target.value || null })}>
          <option value="">Automatisch ({weathers[0]?.entity_id ?? "keine gefunden"})</option>
          {weathers.map((w) => (
            <option key={w.entity_id} value={w.entity_id}>
              {String(w.attributes.friendly_name ?? w.entity_id)} ({w.entity_id})
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-ink-2">
        Sonnenstand: {hasSun ? "aus Home Assistant (sun.sun)" : "aus Uhrzeit und Standort geschätzt – Standort unten eintragen"}.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Breitengrad" unit="°" value={project.settings.latitude} decimals={2} min={-90} max={90} disabled={!canEdit} onCommit={(latitude) => set({ latitude })} />
        <NumberField label="Längengrad" unit="°" value={project.settings.longitude} decimals={2} min={-180} max={180} disabled={!canEdit} onCommit={(longitude) => set({ longitude })} />
        <NumberField label="Plan-Nordrichtung" unit="°" value={project.settings.northAngle} min={-360} max={360} disabled={!canEdit} onCommit={(northAngle) => set({ northAngle })} />
      </div>
      <p className="text-xs text-ink-2">Nordrichtung: 0° = Planoberseite zeigt nach Norden. Positive Werte drehen im Uhrzeigersinn.</p>
    </section>
  );
}

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsSheet() {
  const open = useUi((s) => s.settingsOpen);
  const patch = useUi((s) => s.patch);
  const quality = useUi((s) => s.quality);
  const toast = useUi((s) => s.toast);
  const { project, apply, mode, canEdit, replace } = useProject();
  const session = useApp((s) => s.session);
  const platform = useApp((s) => s.platform);
  const haUrl = useApp((s) => s.haUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{ project: Project; warnings: string[] } | null>(null);
  const [importError, setImportError] = useState<string[] | null>(null);
  if (!open) return null;
  const close = () => {
    patch({ settingsOpen: false });
    setPendingImport(null);
    setImportError(null);
  };

  const exportProject = () => {
    if (!project) return;
    const file = toProjectFile(project);
    const safe = project.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-|-$/g, "") || "zuhause";
    download(`${safe}.lumahome.json`, JSON.stringify(file, null, 2));
    toast("Projekt exportiert (Grundriss, Einrichtung, Assets und Zuordnungen – ohne Zugangsdaten).", "success");
  };

  const onFile = async (f: File) => {
    setImportError(null);
    setPendingImport(null);
    if (f.size > 25 * 1024 * 1024) {
      setImportError(["Die Datei ist größer als 25 MB."]);
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await f.text());
    } catch {
      setImportError(["Die Datei ist kein gültiges JSON."]);
      return;
    }
    const r = parseProjectFile(raw);
    if (!r.ok) setImportError(r.errors);
    else setPendingImport({ project: r.value.project, warnings: r.warnings });
  };

  return (
    <Dialog open title="Einstellungen" onClose={close} wide>
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="section-title">Projekt</h3>
          {project && <TextField label="Name des Zuhauses" value={project.name} onCommit={(name) => apply((p) => ({ ...p, name }))} />}
          <p className="text-xs text-ink-2">
            {mode === "demo" ? "Demo-Projekt – im Browser gespeichert, getrennt vom Live-Projekt." : platform === "web" ? "Live-Projekt – in deinem Home-Assistant-Konto gespeichert, auf allen Geräten mit diesem Konto verfügbar." : "Live-Projekt – auf dem lokalen LumaHome-Server gespeichert (mit Sicherungskopien)."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={exportProject} disabled={!project} data-testid="export">
              <Download size={16} /> Exportieren
            </button>
            <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={!canEdit} data-testid="import">
              <Upload size={16} /> Importieren …
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} data-testid="import-file" />
          </div>
          {importError && (
            <Notice tone="error" title="Import abgelehnt – dein bisheriges Projekt bleibt unverändert">
              <ul className="list-disc pl-5">
                {importError.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Notice>
          )}
          {pendingImport && (
            <Notice tone="warn" title={`„${pendingImport.project.name}“ importieren?`}>
              <p>
                {pendingImport.project.floors.length} Etage(n), {pendingImport.project.rooms.length} Räume, {pendingImport.project.items.length} Objekte, {pendingImport.project.bindings.length} Gerätezuordnungen,{" "}
                {pendingImport.project.meters.length} Messpunkte. Das aktuelle Projekt wird ersetzt (Rückgängig im Bereich Gestalten möglich).
              </p>
              {pendingImport.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {pendingImport.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  className="btn-primary"
                  data-testid="confirm-import"
                  onClick={() => {
                    replace(pendingImport.project, { keepHistory: true });
                    const first = [...pendingImport.project.floors].sort((a, b) => a.elevation - b.elevation)[0];
                    patch({ floorId: first.id, selection: null, card: null });
                    toast("Projekt importiert.", "success");
                    setPendingImport(null);
                  }}
                >
                  Ersetzen
                </button>
                <button className="btn-secondary" onClick={() => setPendingImport(null)}>
                  Abbrechen
                </button>
              </div>
            </Notice>
          )}
        </section>
        {project && <WeatherSettings />}
        <section className="space-y-2">
          <h3 className="section-title">Darstellung</h3>
          <Segmented
            label="Grafikstufe"
            value={quality}
            onChange={(q) => patch({ quality: q })}
            options={[
              { value: "low", label: "Sparsam" },
              { value: "medium", label: "Ausgewogen" },
              { value: "high", label: "Hoch" },
            ]}
          />
          <p className="text-xs text-ink-2">Sparsam: keine Schatten, keine Texturen, kein Kantenglätten, keine Punktlichter – für ältere Wandtablets. Im Stillstand wird generell nicht neu gezeichnet. Reduzierte Bewegung wird aus den Systemeinstellungen übernommen.</p>
        </section>
        {mode === "live" && platform === "web" && (
          <section className="space-y-2">
            <h3 className="section-title">Zugang</h3>
            <p className="text-sm">Verbunden mit {haUrl ?? "Home Assistant"} über deinen langlebigen Zugriffstoken. Das Haus wird in den Benutzerdaten deines Home-Assistant-Kontos gespeichert.</p>
            <button className="btn-secondary" onClick={() => void logout().then(close)}>
              <LogOut size={16} /> Abmelden und Token von diesem Gerät entfernen
            </button>
            <p className="text-xs text-ink-2">Den Token selbst widerrufst du in Home Assistant unter Profil → Sicherheit → Langlebige Zugriffstoken.</p>
          </section>
        )}
        {mode === "live" && platform === "server" && session && (
          <section className="space-y-2">
            <h3 className="section-title">Zugang</h3>
            <p className="text-sm">
              Deine Rechte: <strong>{session.role === "edit" ? "Ansehen, Steuern und Bearbeiten" : session.role === "view" ? "Ansehen und Steuern" : "keine"}</strong>
              {!session.pins.view && !session.pins.edit && " (keine PIN gesetzt – alle, die den Server erreichen, dürfen bearbeiten)"}
            </p>
            {session.role !== "edit" && (session.pins.edit || session.pins.view) && <PinLogin />}
            {(session.pins.edit || session.pins.view) && session.role !== "none" && (
              <button
                className="btn-ghost"
                onClick={async () => {
                  await api("/api/session", { method: "DELETE" });
                  await startLive();
                }}
              >
                <LogOut size={16} /> Abmelden
              </button>
            )}
          </section>
        )}
        <section className="space-y-1 text-xs text-ink-2">
          <h3 className="section-title">Über</h3>
          <p>LumaHome {session?.version ?? "0.1.0"} · läuft lokal · alle Funktionen und Katalogmodelle frei nutzbar, ohne Konto, Kauf oder Freischaltung.</p>
          <p>{platform === "web" ? "Der Zugriffstoken liegt nur in diesem Browser und ist nie Teil von Projekt oder Export." : "Zugangsdaten zu Home Assistant liegen ausschließlich auf dem lokalen Server und sind nie Teil von Projekt oder Export."}</p>
        </section>
      </div>
    </Dialog>
  );
}
