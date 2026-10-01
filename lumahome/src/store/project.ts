// Projektzustand mit Rückgängig/Wiederholen und automatischer Speicherung.
import { create } from "zustand";
import type { Project } from "@/model/types";
import { touch } from "@/geometry/ops";
import { loadDraft, saveDemo, saveDraft, saveLive } from "@/storage/persistence";

export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict" | "readonly" | "local";

interface ProjectStore {
  mode: "demo" | "live";
  project: Project | null;
  revision: number | null;
  past: Project[];
  future: Project[];
  saveStatus: SaveStatus;
  saveError: string | null;
  savedAt: number | null;
  canEdit: boolean;
  /** Ausgangsstand einer laufenden Geste (z. B. Ziehen) */
  gestureBase: Project | null;
  init(mode: "demo" | "live", project: Project | null, revision: number | null, canEdit: boolean): void;
  apply(fn: (p: Project) => Project, opts?: { history?: boolean }): void;
  beginGesture(): void;
  endGesture(): void;
  cancelGesture(): void;
  undo(): void;
  redo(): void;
  replace(p: Project, opts?: { keepHistory?: boolean }): void;
  flush(force?: boolean): Promise<void>;
  setCanEdit(v: boolean): void;
}

const MAX_HISTORY = 100;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export const useProject = create<ProjectStore>((set, get) => {
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().flush(), 700);
  };

  return {
    mode: "demo",
    project: null,
    revision: null,
    past: [],
    future: [],
    saveStatus: "saved",
    saveError: null,
    savedAt: null,
    canEdit: true,
    gestureBase: null,

    init(mode, project, revision, canEdit) {
      if (saveTimer) clearTimeout(saveTimer);
      set({ mode, project, revision, past: [], future: [], saveStatus: canEdit ? "saved" : "readonly", saveError: null, savedAt: project ? Date.now() : null, canEdit, gestureBase: null });
    },

    apply(fn, opts = {}) {
      const { project, canEdit, gestureBase } = get();
      if (!project || !canEdit) return;
      const next = touch(fn(project));
      if (next === project) return;
      const history = opts.history !== false && !gestureBase;
      set({
        project: next,
        past: history ? [...get().past.slice(-MAX_HISTORY + 1), project] : get().past,
        future: history ? [] : get().future,
        saveStatus: "dirty",
      });
      scheduleSave();
    },

    beginGesture() {
      const { project } = get();
      if (project && !get().gestureBase) set({ gestureBase: project });
    },

    endGesture() {
      const { gestureBase, project } = get();
      if (!gestureBase) return;
      if (project && project !== gestureBase) set({ past: [...get().past.slice(-MAX_HISTORY + 1), gestureBase], future: [], gestureBase: null });
      else set({ gestureBase: null });
    },

    cancelGesture() {
      const { gestureBase } = get();
      if (gestureBase) set({ project: gestureBase, gestureBase: null });
    },

    undo() {
      const { past, project, future } = get();
      if (!past.length || !project) return;
      set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], saveStatus: "dirty" });
      scheduleSave();
    },

    redo() {
      const { past, project, future } = get();
      if (!future.length || !project) return;
      set({ project: future[0], future: future.slice(1), past: [...past, project], saveStatus: "dirty" });
      scheduleSave();
    },

    replace(p, opts = {}) {
      const prev = get().project;
      set({
        project: p,
        past: opts.keepHistory && prev ? [...get().past, prev] : [],
        future: [],
        saveStatus: "dirty",
      });
      scheduleSave();
    },

    async flush(force = false) {
      const { project, mode, revision, saveStatus, canEdit } = get();
      if (!project || !canEdit) return;
      if (saveStatus !== "dirty" && saveStatus !== "error" && !force) return;
      if (saveTimer) clearTimeout(saveTimer);
      if (mode === "demo") {
        saveDemo(project);
        set({ saveStatus: "saved", savedAt: Date.now(), saveError: null });
        return;
      }
      set({ saveStatus: "saving" });
      saveDraft({ baseRevision: revision, project, at: Date.now() });
      const r = await saveLive(project, force ? null : revision);
      if (get().project !== project) {
        // Während des Speicherns geändert → erneut speichern
        if (r.ok) set({ revision: r.revision });
        set({ saveStatus: "dirty" });
        scheduleSave();
        return;
      }
      if (r.ok) {
        saveDraft(null);
        set({ saveStatus: "saved", revision: r.revision, savedAt: Date.now(), saveError: null });
      } else if (r.conflict) {
        set({ saveStatus: "conflict", saveError: r.message });
      } else if (r.forbidden) {
        set({ saveStatus: "readonly", saveError: r.message, canEdit: false });
      } else {
        set({ saveStatus: "error", saveError: r.message });
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => void get().flush(), 5000);
      }
    },

    setCanEdit(v) {
      set({ canEdit: v, saveStatus: v ? (get().saveStatus === "readonly" ? "saved" : get().saveStatus) : "readonly" });
    },
  };
});

export { loadDraft };

// Vor dem Schließen ausstehende Änderungen sichern
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    const s = useProject.getState();
    if (s.mode === "demo" && s.project && s.saveStatus === "dirty") saveDemo(s.project);
    if (s.mode === "live" && s.project && (s.saveStatus === "dirty" || s.saveStatus === "saving" || s.saveStatus === "error")) {
      saveDraft({ baseRevision: s.revision, project: s.project, at: Date.now() });
      e.preventDefault();
    }
  });
}
