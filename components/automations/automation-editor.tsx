"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/state/app-context";

const fieldClasses =
  "w-full rounded-xl border border-line bg-surface-raised px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-accent";

export function AutomationEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createAutomation } = useApp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("");
  const [condition, setCondition] = useState("");
  const [action, setAction] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const valid = name.trim() && trigger.trim() && action.trim();

  async function handleSubmit() {
    if (!valid) return;
    setSubmitting(true);
    await createAutomation({
      id: `automation-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || "Benutzerdefinierte Automation",
      enabled: true,
      lastRun: null,
      trigger: trigger.trim(),
      condition: condition.trim() || undefined,
      action: action.trim(),
    });
    setSubmitting(false);
    setName("");
    setDescription("");
    setTrigger("");
    setCondition("");
    setAction("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in sm:items-center" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Neue Automation erstellen"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface-raised p-5 shadow-card animate-fade-in [padding-bottom:calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-xl2"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Neue Automation</h2>
          <button onClick={onClose} aria-label="Schließen" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-hover hover:text-ink">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Sauna nach 2 Std. abschalten" className={fieldClasses} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted">Beschreibung (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kurze Beschreibung" className={fieldClasses} />
          </div>

          <div className="rounded-xl border border-line/70 bg-surface p-3.5">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              <Icon name="workflow" size={13} />
              Wenn – Bedingung – Dann
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs text-accent-strong">Wenn (Auslöser)</label>
                <input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="z. B. Solarleistung > 3 kW" className={fieldClasses} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-ink-faint">Bedingung (optional)</label>
                <input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="z. B. nur zwischen 08:00–20:00 Uhr" className={fieldClasses} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-good">Dann (Aktion)</label>
                <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="z. B. Heizstab einschalten" className={fieldClasses} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" className="flex-1" disabled={!valid || submitting} onClick={handleSubmit}>
            {submitting ? "Speichert…" : "Automation erstellen"}
          </Button>
        </div>
      </div>
    </div>
  );
}
