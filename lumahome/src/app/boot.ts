// Start der Anwendung: Modus bestimmen, Projekt laden, Datenquelle verbinden.
import { create } from "zustand";
import type { Project } from "@/model/types";
import { demoProject } from "@/demo/house";
import { DemoSource } from "@/sources/demo";
import { LiveSource } from "@/sources/live";
import { useLive } from "@/store/live";
import { setLiveBackend, useProject } from "@/store/project";
import { DirectSource } from "@/sources/direct";
import { HaSocket, normalizeHaUrl } from "@/sources/haSocket";
import { clearCredentials, loadCredentials, saveCredentials } from "@/storage/haAuth";
import { clearCache, loadFromHa, readCache } from "@/storage/haProject";
import { useUi } from "@/store/ui";
import { MODE_KEY, fetchSession, loadDemo, loadDraft, loadLive, saveDraft, type SessionInfo } from "@/storage/persistence";

export type Phase = "loading" | "onboarding" | "ready" | "error";

interface AppStore {
  phase: Phase;
  /** „server“: lokaler LumaHome-Server; „web“: Webseite, Browser verbindet sich direkt mit Home Assistant */
  platform: "server" | "web";
  loginError: string | null;
  haUrl: string | null;
  session: SessionInfo | null;
  serverReachable: boolean;
  error: string | null;
  notice: string | null;
  setPhase(p: Phase): void;
}

export const useApp = create<AppStore>((set) => ({
  phase: "loading",
  platform: "server",
  loginError: null,
  haUrl: null,
  session: null,
  serverReachable: false,
  error: null,
  notice: null,
  setPhase: (phase) => set({ phase }),
}));

export function storedMode(): "demo" | "live" | null {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m === "demo" || m === "live" ? m : null;
  } catch {
    return null;
  }
}

function rememberMode(m: "demo" | "live") {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* nicht verfügbar */
  }
}

let demoSource: DemoSource | null = null;
export const getDemoSource = () => demoSource;

function selectFirstFloor(p: Project) {
  const first = [...p.floors].sort((a, b) => a.elevation - b.elevation)[0];
  const cur = useUi.getState().floorId;
  if (!cur || !p.floors.some((f) => f.id === cur)) useUi.getState().patch({ floorId: first?.id ?? null });
}

export async function startDemo(fresh = false) {
  await useProject.getState().flush();
  const p = (!fresh && loadDemo()) || demoProject();
  rememberMode("demo");
  useUi.getState().patch({ selection: null, card: null, floorId: null });
  useProject.getState().init("demo", p, null, true);
  if (fresh) await useProject.getState().flush(true);
  selectFirstFloor(p);
  demoSource = new DemoSource();
  useLive.getState().setSource(demoSource);
  useApp.setState({ phase: "ready", notice: null });
}

/** Wartet auf die erste vollständige Synchronisierung oder einen Anmeldefehler. */
function waitForSync(timeoutMs: number): Promise<"synced" | "auth_failed" | "timeout"> {
  return new Promise((resolve) => {
    const check = () => {
      const s = useLive.getState();
      if (s.synced) return "synced";
      if (s.status.kind === "auth_failed") return "auth_failed";
      return null;
    };
    const first = check();
    if (first) return resolve(first);
    const unsub = useLive.subscribe(() => {
      const r = check();
      if (r) {
        unsub();
        clearTimeout(t);
        resolve(r);
      }
    });
    const t = setTimeout(() => {
      unsub();
      resolve("timeout");
    }, timeoutMs);
  });
}

/** Webseiten-Betrieb: mit gespeicherten Zugangsdaten direkt zu Home Assistant verbinden. */
export async function startDirect(): Promise<void> {
  const creds = loadCredentials();
  if (!creds) {
    useApp.setState({ phase: "onboarding", platform: "web" });
    return;
  }
  await useProject.getState().flush();
  rememberMode("live");
  demoSource = null;
  setLiveBackend("ha");
  useUi.getState().patch({ selection: null, card: null, floorId: null });
  const source = new DirectSource(creds.url, creds.token);
  useLive.getState().setSource(source);
  useApp.setState({ platform: "web", haUrl: creds.url, loginError: null });
  const r = await waitForSync(10_000);
  if (r === "auth_failed") {
    useLive.getState().setSource(null);
    clearCredentials();
    useApp.setState({ phase: "onboarding", loginError: "Home Assistant hat den gespeicherten Token abgelehnt (abgelaufen oder gelöscht). Bitte neu anmelden." });
    return;
  }
  let loaded: { project: Project; revision: number } | null = null;
  let notice: string | null = null;
  if (r === "synced") {
    try {
      loaded = await loadFromHa(source);
    } catch (e) {
      useApp.setState({ phase: "error", error: (e as Error).message });
      return;
    }
  } else {
    loaded = readCache();
    notice = loaded
      ? "Home Assistant ist gerade nicht erreichbar. Angezeigt wird der zuletzt geladene Stand; LumaHome verbindet sich automatisch neu."
      : null;
    if (!loaded) {
      useApp.setState({ phase: "error", error: "Home Assistant ist nicht erreichbar. Prüfe die Verbindung und lade die Seite neu – oder melde dich unter einer anderen Adresse an." });
      return;
    }
  }
  if (!loaded) {
    useProject.getState().init("live", null, null, true);
    useApp.setState({ phase: "onboarding" });
    return;
  }
  useProject.getState().init("live", loaded.project, loaded.revision, true);
  selectFirstFloor(loaded.project);
  useApp.setState({ phase: "ready", notice });
}

/** Anmeldung mit Adresse und langlebigem Zugriffstoken. */
export async function loginWithToken(urlInput: string, token: string, remember: boolean): Promise<void> {
  const url = normalizeHaUrl(urlInput);
  const t = token.trim();
  if (t.length < 20) throw new Error("Der Token ist zu kurz. Bitte den vollständigen langlebigen Zugriffstoken einfügen.");
  await HaSocket.test(url, t);
  saveCredentials({ url, token: t }, remember);
  await startDirect();
}

export async function logout(): Promise<void> {
  await useProject.getState().flush();
  useLive.getState().setSource(null);
  clearCredentials();
  clearCache();
  try {
    localStorage.removeItem(MODE_KEY);
  } catch {
    /* ignorieren */
  }
  useProject.getState().init("live", null, null, false);
  useApp.setState({ phase: "onboarding", haUrl: null, loginError: null });
}

export async function startLive(): Promise<boolean> {
  setLiveBackend("server");
  const session = await fetchSession();
  useApp.setState({ session, serverReachable: !!session });
  if (!session) {
    useApp.setState({ notice: "Der Live-Betrieb benötigt den lokalen LumaHome-Server. Ohne ihn ist nur der Demo-Modus verfügbar." });
    return false;
  }
  if (session.role === "none") {
    useProject.getState().init("live", null, null, false);
    useApp.setState({ phase: "ready" });
    return true;
  }
  await useProject.getState().flush();
  rememberMode("live");
  demoSource = null;
  useUi.getState().patch({ selection: null, card: null, floorId: null });
  let loaded: { project: Project; revision: number } | null;
  try {
    loaded = await loadLive();
  } catch (e) {
    useApp.setState({ phase: "error", error: `Das Projekt konnte nicht geladen werden: ${(e as Error).message}` });
    return true;
  }
  const canEdit = session.role === "edit";
  const draft = loadDraft();
  if (!loaded && !draft) {
    useProject.getState().init("live", null, null, canEdit);
    useLive.getState().setSource(new LiveSource());
    useApp.setState({ phase: canEdit ? "onboarding" : "ready" });
    return true;
  }
  let project = loaded?.project ?? draft!.project;
  const revision = loaded?.revision ?? null;
  let notice: string | null = null;
  if (draft && canEdit) {
    if ((loaded?.revision ?? null) === draft.baseRevision) {
      project = draft.project;
      notice = "Nicht gespeicherte Änderungen wurden wiederhergestellt.";
    } else if (loaded) {
      notice = "Ein lokaler Entwurf war veraltet, weil das Projekt inzwischen an einem anderen Gerät geändert wurde. Der gespeicherte Stand wird verwendet.";
      saveDraft(null);
    }
  }
  useProject.getState().init("live", project, revision, canEdit);
  if (project === draft?.project) {
    useProject.setState({ saveStatus: "dirty" });
    void useProject.getState().flush();
  }
  selectFirstFloor(project);
  useLive.getState().setSource(new LiveSource());
  useApp.setState({ phase: "ready", notice });
  return true;
}

/** Legt im Live-Betrieb ein neues Projekt an (aus der Ersteinrichtung). */
export async function createLiveProject(p: Project) {
  const canEdit = useApp.getState().platform === "web" || useApp.getState().session?.role === "edit";
  useProject.getState().init("live", p, null, canEdit);
  useProject.setState({ saveStatus: "dirty" });
  await useProject.getState().flush();
  selectFirstFloor(p);
  useApp.setState({ phase: "ready" });
}

export async function boot() {
  const session = await fetchSession();
  useApp.setState({ session, serverReachable: !!session, platform: session ? "server" : "web" });
  const mode = storedMode();
  if (mode === "demo") {
    await startDemo();
    return;
  }
  if (!session) {
    // Webseiten-Betrieb ohne eigenen Server
    if (loadCredentials()) await startDirect();
    else useApp.setState({ phase: "onboarding" });
    return;
  }
  setLiveBackend("server");
  if (session && (mode === "live" || session.role === "none")) {
    await startLive();
    return;
  }
  // Ein Gerät ohne gespeicherte Wahl startet direkt im vorhandenen Haus
  if (session) {
    try {
      if (await loadLive()) {
        await startLive();
        return;
      }
    } catch {
      /* Fehler zeigt startLive bei Bedarf an */
    }
  }
  // Erster Start
  useApp.setState({ phase: "onboarding" });
}

export async function switchMode(m: "demo" | "live") {
  if (m === "demo") return startDemo();
  if (useApp.getState().platform === "web") {
    if (loadCredentials()) return startDirect();
    useApp.setState({ phase: "onboarding" });
    return;
  }
  const ok = await startLive();
  if (!ok) useUi.getState().toast("Live-Betrieb nicht möglich: lokaler Server nicht erreichbar.", "error");
}
