// Speicherung der Projekte.
//   Demo:  ausschließlich im Browser (localStorage), getrennt vom Live-Projekt.
//   Live:  auf dem lokalen LumaHome-Server (data/project.json) mit Revisionen.
//          Zusätzlich ein lokaler Entwurf, falls der Server kurzzeitig
//          nicht erreichbar ist.
import type { Project } from "@/model/types";
import { parseProject } from "@/model/schema";
import { api, ApiError } from "@/sources/live";

const DEMO_KEY = "lumahome.demo.project.v1";
const DRAFT_KEY = "lumahome.live.draft.v1";
export const MODE_KEY = "lumahome.mode.v1";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* Speicher voll oder gesperrt */
  }
}

export function loadDemo(): Project | null {
  const raw = safeGet(DEMO_KEY);
  if (!raw) return null;
  try {
    const r = parseProject(JSON.parse(raw));
    return r.ok ? r.value : null;
  } catch {
    return null;
  }
}

export function saveDemo(p: Project | null) {
  safeSet(DEMO_KEY, p ? JSON.stringify(p) : null);
}

export interface Draft {
  baseRevision: number | null;
  project: Project;
  at: number;
}

export function loadDraft(): Draft | null {
  const raw = safeGet(DRAFT_KEY);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Draft;
    const r = parseProject(d.project);
    return r.ok ? { ...d, project: r.value } : null;
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft | null) {
  safeSet(DRAFT_KEY, d ? JSON.stringify(d) : null);
}

export interface SessionInfo {
  role: "none" | "view" | "edit";
  pins: { view: boolean; edit: boolean };
  ha: { configured: boolean; host: string | null };
  version: string;
}

export async function fetchSession(): Promise<SessionInfo | null> {
  try {
    return await api<SessionInfo>("/api/session");
  } catch {
    return null;
  }
}

export async function loadLive(): Promise<{ project: Project; revision: number } | null> {
  try {
    const r = await api<{ project: unknown; revision: number }>("/api/project");
    const parsed = parseProject(r.project);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    return { project: parsed.value, revision: r.revision };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export type SaveOutcome = { ok: true; revision: number } | { ok: false; conflict: boolean; forbidden: boolean; message: string };

export async function saveLive(project: Project, baseRevision: number | null): Promise<SaveOutcome> {
  try {
    const r = await api<{ revision: number }>("/api/project", { method: "PUT", body: JSON.stringify({ project, baseRevision }) });
    return { ok: true, revision: r.revision };
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    return { ok: false, conflict: status === 409, forbidden: status === 401 || status === 403, message: (e as Error).message };
  }
}
