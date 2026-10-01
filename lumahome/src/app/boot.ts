// Start der Anwendung: Modus bestimmen, Projekt laden, Datenquelle verbinden.
import { create } from "zustand";
import type { Project } from "@/model/types";
import { demoProject } from "@/demo/house";
import { DemoSource } from "@/sources/demo";
import { LiveSource } from "@/sources/live";
import { useLive } from "@/store/live";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { MODE_KEY, fetchSession, loadDemo, loadDraft, loadLive, saveDraft, type SessionInfo } from "@/storage/persistence";

export type Phase = "loading" | "onboarding" | "ready" | "error";

interface AppStore {
  phase: Phase;
  session: SessionInfo | null;
  serverReachable: boolean;
  error: string | null;
  notice: string | null;
  setPhase(p: Phase): void;
}

export const useApp = create<AppStore>((set) => ({
  phase: "loading",
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

export async function startLive(): Promise<boolean> {
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
  const canEdit = useApp.getState().session?.role === "edit";
  useProject.getState().init("live", p, null, canEdit);
  useProject.setState({ saveStatus: "dirty" });
  await useProject.getState().flush();
  selectFirstFloor(p);
  useApp.setState({ phase: "ready" });
}

export async function boot() {
  const session = await fetchSession();
  useApp.setState({ session, serverReachable: !!session });
  const mode = storedMode();
  if (mode === "demo") {
    await startDemo();
    return;
  }
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
  const ok = await startLive();
  if (!ok) useUi.getState().toast("Live-Betrieb nicht möglich: lokaler Server nicht erreichbar.", "error");
}
