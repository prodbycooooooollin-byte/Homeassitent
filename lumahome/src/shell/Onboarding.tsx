// Kurze Ersteinrichtung beim ersten Start.
import { HardDrive, Home, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { createLiveProject, startDemo, startLive, useApp } from "@/app/boot";
import { makeRoom, rectVertices } from "@/geometry/ops";
import { newId } from "@/model/ids";
import { parseProjectFile } from "@/model/schema";
import { DEFAULT_SETTINGS, type Project } from "@/model/types";
import { useUi } from "@/store/ui";
import { Notice, TextField } from "@/ui/primitives";
import { PinLogin } from "./SettingsSheet";
import { useProject } from "@/store/project";

function newProject(name: string, withRoom: boolean): Project {
  const floorId = newId("floor");
  const now = new Date().toISOString();
  return {
    id: newId("proj"),
    name,
    createdAt: now,
    updatedAt: now,
    floors: [{ id: floorId, name: "Erdgeschoss", elevation: 0, height: 2.6 }],
    rooms: withRoom ? [makeRoom(floorId, "Wohnzimmer", rectVertices(0, 0, 5, 4))] : [],
    openings: [],
    voids: [],
    items: [],
    bindings: [],
    meters: [],
    underlays: [],
    assets: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function Onboarding() {
  const session = useApp((s) => s.session);
  const reachable = useApp((s) => s.serverReachable);
  const live = useProject((s) => s.mode === "live");
  const [step, setStep] = useState<"start" | "live">(live ? "live" : "start");
  const [name, setName] = useState("Mein Zuhause");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const patch = useUi((s) => s.patch);

  const begin = async (withRoom: boolean) => {
    await createLiveProject(newProject(name, withRoom));
    patch({ tab: "design", designTool: "plan", planTool: withRoom ? "select" : "rect" });
  };

  const importFile = async (f: File) => {
    try {
      const r = parseProjectFile(JSON.parse(await f.text()));
      if (!r.ok) return setError(r.errors.join(" · "));
      await createLiveProject(r.value.project);
    } catch {
      setError("Die Datei konnte nicht gelesen werden.");
    }
  };

  return (
    <main className="flex min-h-full items-center justify-center bg-gradient-to-b from-canvas to-[#E7EAE3] p-4">
      <div className="panel w-full max-w-xl p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-12 w-12" />
          <div>
            <h1 className="text-xl font-semibold">Willkommen bei LumaHome</h1>
            <p className="text-sm text-ink-2">Zuhause zeichnen, einrichten, Geräte verbinden und Verbrauch verstehen.</p>
          </div>
        </div>
        {step === "start" && (
          <div className="space-y-3">
            <button
              className="flex w-full items-start gap-3 rounded-2xl border border-line p-4 text-left hover:border-sage disabled:opacity-50"
              disabled={!reachable}
              onClick={async () => {
                const ok = await startLive();
                if (ok) setStep("live");
              }}
              data-testid="choose-live"
            >
              <Home className="mt-0.5 shrink-0 text-sage" />
              <span>
                <span className="block font-semibold">Mein Zuhause einrichten</span>
                <span className="block text-sm text-ink-2">
                  {reachable
                    ? session?.ha.configured
                      ? `Mit Home Assistant (${session.ha.host}) über den lokalen LumaHome-Server.`
                      : "Planen ist sofort möglich. Für echte Geräte HA_URL und HA_TOKEN am Server setzen (siehe Anleitung)."
                    : "Benötigt den lokalen LumaHome-Server – in dieser Vorschau nicht erreichbar."}
                </span>
              </span>
            </button>
            <button className="flex w-full items-start gap-3 rounded-2xl border border-line p-4 text-left hover:border-energy" onClick={() => void startDemo()} data-testid="choose-demo">
              <HardDrive className="mt-0.5 shrink-0 text-energy" />
              <span>
                <span className="block font-semibold">Demo-Haus ansehen</span>
                <span className="block text-sm text-ink-2">Eingerichtetes Beispielhaus mit simulierten Geräten und Beispieldaten – deutlich als Demo gekennzeichnet.</span>
              </span>
            </button>
          </div>
        )}
        {step === "live" && (
          <div className="space-y-4">
            {session?.role === "none" ? (
              <>
                <Notice tone="info">Für diesen LumaHome-Server ist eine PIN gesetzt.</Notice>
                <PinLogin />
              </>
            ) : (
              <>
                {!session?.ha.configured && (
                  <Notice tone="info">Home Assistant ist am Server noch nicht eingerichtet. Du kannst trotzdem schon planen und einrichten – Geräte verbindest du später.</Notice>
                )}
                <TextField label="Name deines Zuhauses" value={name} onCommit={setName} />
                <div className="grid gap-2 sm:grid-cols-3">
                  <button className="btn-primary" onClick={() => void begin(true)} data-testid="start-with-room">
                    Mit einem Raum beginnen
                  </button>
                  <button className="btn-secondary" onClick={() => void begin(false)} data-testid="start-empty">
                    Leer beginnen
                  </button>
                  <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
                    <Upload size={16} /> Importieren
                  </button>
                </div>
                <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
                {error && <Notice tone="error">{error}</Notice>}
                <button className="text-sm text-ink-2 underline" onClick={() => void startDemo()}>
                  Lieber erst die Demo ansehen
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
