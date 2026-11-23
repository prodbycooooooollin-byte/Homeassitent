import { clsx } from "clsx";
import { X } from "lucide-react";
import { useUi } from "@/store/ui";

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const drop = useUi((s) => s.dropToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "fade-in pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl border px-4 py-2.5 text-sm shadow-float",
            t.tone === "success" && "border-sage/30 bg-surface text-ink",
            t.tone === "info" && "border-line bg-surface text-ink",
            t.tone === "warn" && "border-warn-line bg-warn-soft text-warn",
            t.tone === "error" && "border-danger-line bg-danger-soft text-danger",
          )}
        >
          <span className="flex-1">{t.text}</span>
          <button className="-mr-2 -mt-1 rounded-lg p-1 opacity-70 hover:opacity-100" aria-label="Hinweis schließen" onClick={() => drop(t.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
