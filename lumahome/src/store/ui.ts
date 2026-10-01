import { create } from "zustand";
import type { Id, Selection } from "@/model/types";
import type { RangeKind } from "@/energy/series";

export type Tab = "home" | "design" | "energy" | "devices";
export type DesignTool = "plan" | "furnish" | "connect";
export type PlanTool = "select" | "rect" | "poly" | "door" | "window" | "passage" | "void";
export type DesignView = "2d" | "3d" | "split";
export type WallMode = "full" | "cut" | "low";
export type Quality = "low" | "medium" | "high";

export interface Layers {
  devices: boolean;
  labels: boolean;
  climate: boolean;
  windows: boolean;
  energy: boolean;
  warnings: boolean;
  legend: boolean;
}

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "success" | "warn" | "error";
}

export type CardTarget = { kind: "item" | "opening" | "room"; id: Id } | null;

interface UiStore {
  tab: Tab;
  floorId: Id | null;
  selection: Selection;
  designTool: DesignTool;
  planTool: PlanTool;
  designView: DesignView;
  layers: Layers;
  wallMode: WallMode;
  showRoof: boolean;
  floorsMode: "current" | "stack";
  quality: Quality;
  card: CardTarget;
  /** Fokussierungsanfrage an die Kamera (Zähler erzwingt Ausführung) */
  focus: { roomId: Id | null; n: number };
  energyRange: RangeKind;
  energyAnchor: number;
  energyMeterId: Id | null;
  energyMode: "energy" | "power";
  toasts: Toast[];
  settingsOpen: boolean;
  set<K extends keyof UiStore>(k: K, v: UiStore[K]): void;
  patch(p: Partial<UiStore>): void;
  setLayer(k: keyof Layers, v: boolean): void;
  select(s: Selection): void;
  focusRoom(roomId: Id | null): void;
  toast(text: string, tone?: Toast["tone"]): void;
  dropToast(id: number): void;
}

const PREFS_KEY = "lumahome.ui.v1";

function loadPrefs(): Partial<Pick<UiStore, "quality" | "layers" | "wallMode" | "designView">> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

const prefs = typeof localStorage !== "undefined" ? loadPrefs() : {};

function defaultQuality(): Quality {
  if (typeof navigator === "undefined") return "medium";
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency ?? 4;
  if ((mem && mem <= 2) || cores <= 2) return "low";
  return "medium";
}

let toastId = 0;

export const useUi = create<UiStore>((set, get) => ({
  tab: "home",
  floorId: null,
  selection: null,
  designTool: "plan",
  planTool: "select",
  designView: prefs.designView ?? "2d",
  layers: { devices: false, labels: false, climate: false, windows: false, energy: false, warnings: true, legend: false, ...(prefs.layers ?? {}) },
  wallMode: prefs.wallMode ?? "cut",
  showRoof: false,
  floorsMode: "current",
  quality: prefs.quality ?? defaultQuality(),
  card: null,
  focus: { roomId: null, n: 0 },
  energyRange: "day",
  energyAnchor: Date.now(),
  energyMeterId: null,
  energyMode: "energy",
  toasts: [],
  settingsOpen: false,
  set: (k, v) => set({ [k]: v } as Partial<UiStore>),
  patch: (p) => set(p),
  setLayer: (k, v) => set({ layers: { ...get().layers, [k]: v } }),
  select: (s) => set({ selection: s }),
  focusRoom: (roomId) => set({ focus: { roomId, n: get().focus.n + 1 } }),
  toast: (text, tone = "info") => {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-3), { id, text, tone }] });
    setTimeout(() => get().dropToast(id), tone === "error" ? 8000 : 4500);
  },
  dropToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

useUi.subscribe((s, prev) => {
  if (s.quality === prev.quality && s.layers === prev.layers && s.wallMode === prev.wallMode && s.designView === prev.designView) return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ quality: s.quality, layers: s.layers, wallMode: s.wallMode, designView: s.designView }));
  } catch {
    /* Speicher nicht verfügbar */
  }
});
