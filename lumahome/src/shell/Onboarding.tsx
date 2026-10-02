// Kurze Ersteinrichtung beim ersten Start.
import { HardDrive, Home, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { createLiveProject, loginWithToken, startDemo, startLive, useApp } from "@/app/boot";
import { mixedContentProblem, normalizeHaUrl } from "@/sources/haSocket";
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

const TOKEN_STEPS = [
  "Home Assistant öffnen (App oder Browser) und anmelden.",
  "Unten links auf deinen Namen tippen, um das Profil zu öffnen.",
  "Oben den Reiter „Sicherheit“ wählen.",
  "Ganz unten bei „Langlebige Zugriffstoken“ auf „Token erstellen“ tippen.",
  "Einen Namen eingeben, z. B. „LumaHome“, und bestätigen.",
  "Den angezeigten Token kopieren – er wird nur einmal angezeigt – und hier einfügen.",
];

function LoginForm() {
  const loginError = useApp((s) => s.loginError);
  const [url, setUrl] = useState(() => {
    try {
      return localStorage.getItem("lumahome.ha.lastUrl") ?? "";
    } catch {
      return "";
    }
  });
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(loginError);
  const [showSteps, setShowSteps] = useState(false);
  let mixed: string | null = null;
  try {
    mixed = url.trim() ? mixedContentProblem(normalizeHaUrl(url)) : null;
  } catch {
    mixed = null;
  }
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      try {
        localStorage.setItem("lumahome.ha.lastUrl", url.trim());
      } catch {
        /* ignorieren */
      }
      await loginWithToken(url, token, remember);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      data-testid="login-form"
    >
      <div>
        <label className="label" htmlFor="ha-url">
          Adresse deiner Home-Assistant-Instanz
        </label>
        <input
          id="ha-url"
          className="input"
          inputMode="url"
          autoComplete="url"
          placeholder="https://xxxxxxxx.ui.nabu.casa oder https://ha.meine-domain.de"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <p className="mt-1 text-xs text-ink-2">So, wie du Home Assistant im Browser öffnest – ohne „/lovelace“ o. Ä.</p>
      </div>
      {mixed && <Notice tone="warn">{mixed}</Notice>}
      <div>
        <label className="label" htmlFor="ha-token">
          Langlebiger Zugriffstoken
        </label>
        <textarea
          id="ha-token"
          className="input min-h-[88px] py-2 font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
          placeholder="eyJhbGciOi…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
        <button type="button" className="mt-1 text-xs font-medium text-sage-dark underline" onClick={() => setShowSteps(!showSteps)} aria-expanded={showSteps}>
          {showSteps ? "Anleitung ausblenden" : "Wie bekomme ich einen Token?"}
        </button>
        {showSteps && (
          <ol className="mt-2 list-decimal space-y-1 rounded-2xl bg-surface-2 py-3 pl-8 pr-3 text-sm" data-testid="token-steps">
            {TOKEN_STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-sage" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>
          Auf diesem Gerät angemeldet bleiben
          <span className="block text-xs text-ink-2">Der Token wird nur in diesem Browser gespeichert – nie in deinem Haus-Projekt oder Export. Auf fremden Geräten abwählen.</span>
        </span>
      </label>
      {error && (
        <Notice tone="error" title="Anmeldung nicht möglich">
          {error}
        </Notice>
      )}
      <button className="btn-primary w-full" type="submit" disabled={busy || !url.trim() || !token.trim()} data-testid="login-submit">
        {busy ? "Verbinde …" : "Mit Home Assistant verbinden"}
      </button>
      <p className="text-xs text-ink-2">
        Die Seite verbindet sich direkt von deinem Gerät mit Home Assistant. Es gibt keinen Zwischenserver. Es gelten die Rechte deines HA-Benutzers; Bereichsvorschläge benötigen ein Administratorkonto.
      </p>
    </form>
  );
}

export function Onboarding() {
  const session = useApp((s) => s.session);
  const reachable = useApp((s) => s.serverReachable);

  const live = useProject((s) => s.mode === "live");
  const platform = useApp((s) => s.platform);
  const haUrl = useApp((s) => s.haUrl);
  const [serverStep, setStep] = useState<"start" | "live">(live ? "live" : "start");
  // Webseite: nach erfolgreicher Anmeldung ohne vorhandenes Haus direkt zur Anlage
  const step = platform === "web" ? (haUrl ? "live" : "start") : serverStep;
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
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-12 w-12" />
          <div>
            <h1 className="text-xl font-semibold">Willkommen bei LumaHome</h1>
            <p className="text-sm text-ink-2">Zuhause zeichnen, einrichten, Geräte verbinden und Verbrauch verstehen.</p>
          </div>
        </div>
        {step === "start" && platform === "web" && (
          <div className="space-y-5">
            <LoginForm />
            <div className="flex items-center gap-3 text-xs text-ink-3">
              <span className="h-px flex-1 bg-line" /> oder <span className="h-px flex-1 bg-line" />
            </div>
            <button className="flex w-full items-start gap-3 rounded-2xl border border-line p-4 text-left hover:border-energy" onClick={() => void startDemo()} data-testid="choose-demo">
              <HardDrive className="mt-0.5 shrink-0 text-energy" />
              <span>
                <span className="block font-semibold">Erst einmal das Demo-Haus ansehen</span>
                <span className="block text-sm text-ink-2">Simulierte Geräte und Beispieldaten – ohne Anmeldung.</span>
              </span>
            </button>
          </div>
        )}
        {step === "start" && platform === "server" && (
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
            {platform === "server" && session?.role === "none" ? (
              <>
                <Notice tone="info">Für diesen LumaHome-Server ist eine PIN gesetzt.</Notice>
                <PinLogin />
              </>
            ) : (
              <>
                {platform === "server" && !session?.ha.configured && (
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
