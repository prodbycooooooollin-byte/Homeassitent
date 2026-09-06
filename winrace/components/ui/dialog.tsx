"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

/**
 * Nutzt das native <dialog>-Element: liefert Fokus-Trap, ESC-zum-Schließen
 * und Top-Layer-Rendering ohne zusätzliche JS-Bibliothek.
 */
export function Dialog({ open, onClose, title, description, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-base-border-strong bg-base-card p-0 text-ink shadow-glow backdrop:bg-black/70 backdrop:backdrop-blur-sm animate-pop"
    >
      <div className="flex items-start justify-between gap-4 border-b border-base-border p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-ink-faint">{description}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Schließen">
          <X className="h-4 w-4" />
        </Button>
      </div>
      {children && <div className="p-5">{children}</div>}
      {footer && <div className="flex justify-end gap-2 border-t border-base-border p-4">{footer}</div>}
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  loading?: boolean;
}

/** Für "Sicherheitsabfrage bei größeren Korrekturen" / kritische Host-Aktionen. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  variant = "primary",
  loading,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
