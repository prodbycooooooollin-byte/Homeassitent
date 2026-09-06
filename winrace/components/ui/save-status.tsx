import { Check, Loader2, TriangleAlert } from "lucide-react";
import type { SaveStatus } from "@/lib/hooks/use-autosave";

export function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-faint">
      {status === "saving" && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Speichert …
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="h-3.5 w-3.5 text-success" /> Gespeichert
        </>
      )}
      {status === "error" && (
        <>
          <TriangleAlert className="h-3.5 w-3.5 text-danger" /> Fehler beim Speichern
        </>
      )}
    </span>
  );
}
