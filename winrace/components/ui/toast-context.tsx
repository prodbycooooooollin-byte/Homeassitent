"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastVariant = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  push: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-success" />,
  error: <XCircle className="h-5 w-5 text-danger" />,
  warning: <TriangleAlert className="h-5 w-5 text-warning" />,
  info: <Info className="h-5 w-5 text-info" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border border-base-border-strong bg-base-card p-3.5 shadow-glow"
          >
            {ICONS[t.variant]}
            <div className="flex-1 text-sm">
              <p className="font-medium text-ink">{t.title}</p>
              {t.description && <p className="mt-0.5 text-ink-faint">{t.description}</p>}
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-ink-faint hover:text-ink"
              aria-label="Benachrichtigung schließen"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast muss innerhalb von <ToastProvider> verwendet werden.");
  return ctx;
}
