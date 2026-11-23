import { useEffect } from "react";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";

/** Tastenkürzel: Rückgängig/Wiederholen im Bereich Gestalten. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (useUi.getState().tab !== "design") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useProject.getState().redo();
        else useProject.getState().undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        useProject.getState().redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
