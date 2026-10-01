// Einstellungen: Projekt, Export/Import, Grafik, Zugang.
import { Download, KeyRound, LogOut, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { useApp, startLive } from "@/app/boot";
import { parseProjectFile, toProjectFile } from "@/model/schema";
import type { Project } from "@/model/types";
import { Dialog, Notice, Segmented, TextField } from "@/ui/primitives";
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
            {mode === "demo" ? "Demo-Projekt – im Browser gespeichert, getrennt vom Live-Projekt." : "Live-Projekt – auf dem lokalen LumaHome-Server gespeichert (mit Sicherungskopien)."}
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
        {mode === "live" && session && (
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
          <p>Zugangsdaten zu Home Assistant liegen ausschließlich auf dem lokalen Server und sind nie Teil von Projekt oder Export.</p>
        </section>
      </div>
    </Dialog>
  );
}
