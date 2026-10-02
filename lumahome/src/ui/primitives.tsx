import { clsx } from "clsx";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={clsx(
            "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors",
            size === "sm" ? "min-h-[36px] px-2.5 text-xs" : "min-h-[40px] px-3 text-sm",
            value === o.value ? "bg-surface text-ink shadow-soft" : "text-ink-2s hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled, busy }: { checked: boolean | null; onChange: (v: boolean) => void; label: string; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked === null ? "mixed" : checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
        checked ? "border-sage bg-sage" : "border-line-strong bg-surface-3",
        checked === null && "bg-surface-2",
      )}
    >
      <span
        className={clsx(
          "absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[26px]" : "translate-x-[3px]",
          busy && "ring-2 ring-lamp",
        )}
      />
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onCommit,
  label,
  format,
  disabled,
  accent = "sage",
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (v: number) => void;
  label: string;
  format?: (v: number) => string;
  disabled?: boolean;
  accent?: "sage" | "lamp" | "energy";
}) {
  const [local, setLocal] = useState(value);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setLocal(value);
  }, [value]);
  const id = useId();
  const commit = () => {
    dragging.current = false;
    if (local !== value) onCommit(local);
  };
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-ink-2">
        <label htmlFor={id}>{label}</label>
        <span className="tabular-nums text-ink">{format ? format(local) : local}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        disabled={disabled}
        onPointerDown={() => (dragging.current = true)}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={() => dragging.current && commit()}
        className={clsx("h-8 w-full cursor-pointer", accent === "lamp" ? "accent-lamp" : accent === "energy" ? "accent-energy" : "accent-sage")}
        style={{ touchAction: "none" }}
      />
    </div>
  );
}

/** Zahleneingabe mit Einheit; übernimmt den Wert bei Enter/Verlassen. */
export function NumberField({
  label,
  value,
  onCommit,
  unit,
  step = 1,
  min,
  max,
  decimals = 0,
  scale = 1,
  disabled,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  /** Anzeigefaktor (z. B. 100 für m → cm) */
  scale?: number;
  disabled?: boolean;
}) {
  const shown = (value * scale).toFixed(decimals);
  const [text, setText] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  const lastCommitted = useRef<string | null>(null);
  useEffect(() => {
    setText(shown);
    lastCommitted.current = null;
  }, [shown]);
  const id = useId();
  const commit = () => {
    // Enter löst danach noch blur aus – denselben Wert nicht zweimal übernehmen
    if (lastCommitted.current === text) return;
    const n = Number(text.replace(",", "."));
    if (!Number.isFinite(n)) {
      setError("Keine Zahl");
      return;
    }
    if ((min !== undefined && n < min) || (max !== undefined && n > max)) {
      setError(`Erlaubt: ${min ?? "…"} bis ${max ?? "…"}${unit ? ` ${unit}` : ""}`);
      return;
    }
    setError(null);
    if (n.toFixed(decimals) !== shown) {
      lastCommitted.current = text;
      onCommit(n / scale);
    }
  };
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className={clsx("input pr-10 tabular-nums", error && "border-danger")}
          inputMode="decimal"
          value={text}
          disabled={disabled}
          step={step}
          aria-invalid={!!error}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") {
              setText(shown);
              setError(null);
            }
          }}
        />
        {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-2">{unit}</span>}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function TextField({ label, value, onCommit, placeholder, maxLength = 60 }: { label: string; value: string; onCommit: (v: string) => void; placeholder?: string; maxLength?: number }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const id = useId();
  const commit = () => {
    const t = text.trim();
    if (t && t !== value) onCommit(t);
    else setText(value);
  };
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        value={text}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-0 sm:items-center sm:p-6" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx("sheet-in flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-surface shadow-float sm:rounded-3xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function Notice({ tone = "info", children, title }: { tone?: "info" | "warn" | "error" | "demo"; children: ReactNode; title?: string }) {
  return (
    <div
      role={tone === "error" ? "alert" : "note"}
      className={clsx(
        "rounded-2xl border px-3 py-2 text-sm",
        tone === "info" && "border-line bg-surface-2 text-ink",
        tone === "warn" && "border-warn-line bg-warn-soft text-warn",
        tone === "error" && "border-danger-line bg-danger-soft text-danger",
        tone === "demo" && "border-energy/30 bg-energy-soft text-energy-dark",
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {icon && <div className="text-ink-3">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}
