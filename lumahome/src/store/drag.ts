// Ziehen aus dem Katalog (Maus und Touch, ohne HTML5-Drag-and-drop).
import { create } from "zustand";

interface DragStore {
  catalogId: string | null;
  x: number;
  y: number;
  rotation: number;
  start(catalogId: string, x: number, y: number): void;
  move(x: number, y: number): void;
  rotate(delta: number): void;
  end(): void;
}

export const useDrag = create<DragStore>((set) => ({
  catalogId: null,
  x: 0,
  y: 0,
  rotation: 0,
  start: (catalogId, x, y) => set({ catalogId, x, y, rotation: 0 }),
  move: (x, y) => set({ x, y }),
  rotate: (d) => set((s) => ({ rotation: s.rotation + d })),
  end: () => set({ catalogId: null }),
}));

type DropHandler = (catalogId: string, clientX: number, clientY: number, rotation: number) => boolean;
const dropTargets: DropHandler[] = [];

/** Registriert eine Ablagefläche (2D-Plan oder 3D-Ansicht). Liefert eine Abmeldefunktion. */
export function registerDropTarget(fn: DropHandler) {
  dropTargets.push(fn);
  return () => {
    const i = dropTargets.indexOf(fn);
    if (i >= 0) dropTargets.splice(i, 1);
  };
}

export function dispatchDrop(catalogId: string, x: number, y: number, rotation: number): boolean {
  for (const t of [...dropTargets].reverse()) if (t(catalogId, x, y, rotation)) return true;
  return false;
}
