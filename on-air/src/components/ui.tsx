import { AlertTriangle, CheckCircle2, Info, Music2, X, XCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { describeError } from "../lib/errors";
import { t } from "../lib/i18n";
import type { Tone } from "../lib/status";

export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <rect x="64" y="64" width="896" height="896" rx="208" fill="var(--surface-3)" />
      <g fill="none" stroke="var(--accent)" strokeLinecap="round" strokeWidth="60">
        <path d="M372 372 A200 200 0 0 0 372 652" />
        <path d="M652 372 A200 200 0 0 1 652 652" />
        <path d="M282 282 A327 327 0 0 0 282 742" strokeOpacity=".5" />
        <path d="M742 282 A327 327 0 0 1 742 742" strokeOpacity=".5" />
      </g>
      <circle cx="512" cy="512" r="80" fill="var(--accent)" />
    </svg>
  );
}

export function Toggle({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; id?: string }) {
  return (
    <label className="toggle">
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true" />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({ tone, label, text, onClick, title }: { tone: Tone; label: string; text: string; onClick?: () => void; title?: string }) {
  return (
    <button type="button" className={`pill tone-${tone}`} onClick={onClick} title={title ?? `${label}: ${text}`}>
      <span className="dot" aria-hidden="true" />
      <span className="ellipsis">
        <span className="subtle">{label}</span>
        <span className="pill-text"> · {text}</span>
      </span>
    </button>
  );
}

export function Badge({ tone, children, title }: { tone?: "accent" | "warn" | "danger" | "info"; children: ReactNode; title?: string }) {
  return (
    <span className={`badge ${tone ?? ""}`} title={title}>
      {children}
    </span>
  );
}

/** Fehler- bzw. Hinweisbox: Titel, konkrete Handlung, aufklappbare technische Details. */
export function Notice({
  tone,
  title,
  children,
  code,
  technical,
  actions,
}: {
  tone: "warn" | "error" | "info" | "ok";
  title?: string;
  children?: ReactNode;
  code?: string;
  technical?: string;
  actions?: ReactNode;
}) {
  const desc = code ? describeError(code) : null;
  const Icon = tone === "error" ? XCircle : tone === "warn" ? AlertTriangle : tone === "ok" ? CheckCircle2 : Info;
  return (
    <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon className="n-icon" size={18} aria-hidden="true" />
      <div className="col" style={{ gap: 2 }}>
        <div className="n-title">{title ?? desc?.title}</div>
        {children ? <div className="muted">{children}</div> : desc?.action ? <div className="muted">{desc.action}</div> : null}
        {technical && (
          <details className="tech">
            <summary>{t("common.details")}</summary>
            <pre>{technical}</pre>
          </details>
        )}
      </div>
      {actions && <div className="n-actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="e-icon">{icon ?? <Music2 size={20} />}</div>
      <div className="e-title">{title}</div>
      {children && <div className="small">{children}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

/** Albumcover unverzerrt (quadratisch, object-fit: cover) mit Platzhalter. */
export function Cover({ url, className, size, alt = "" }: { url: string | null | undefined; className?: string; size?: number; alt?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const style = size ? { width: size, height: size } : undefined;
  if (!url || failed)
    return (
      <div className={`${className ?? "cover"} cover-ph ph`} style={style} aria-hidden="true">
        <Music2 size={size ? Math.max(14, size / 3) : 28} />
      </div>
    );
  return <img className={className ?? "cover"} src={url} alt={alt} style={style} loading="lazy" draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

export function Dialog({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, button:not([data-close]), select, textarea, [tabindex]");
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])")).filter((x) => !x.hasAttribute("disabled"));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} tabIndex={-1}>
        <div className="dialog-head">
          <h2 id={id}>{title}</h2>
          <button className="icon-btn sm" data-close onClick={onClose} aria-label={t("common.close")}>
            <X size={16} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function SettingRow({ title, desc, children }: { title: ReactNode; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="sr-text">
        <div className="sr-title">{title}</div>
        {desc && <div className="sr-desc">{desc}</div>}
      </div>
      <div className="row" style={{ flex: "none" }}>
        {children}
      </div>
    </div>
  );
}

// ---------- Toasts ----------
type ToastItem = { id: number; text: string; tone: "ok" | "error" };
let toasts: ToastItem[] = [];
const toastListeners = new Set<() => void>();
let toastId = 0;
export function toast(text: string, tone: "ok" | "error" = "ok") {
  const id = ++toastId;
  toasts = [...toasts, { id, text, tone }].slice(-4);
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== id);
    toastListeners.forEach((l) => l());
  }, tone === "error" ? 7000 : 3200);
}
export function ToastHost() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
  return (
    <div className="toast-wrap" aria-live="polite">
      {list.map((x) => (
        <div key={x.id} className={`toast ${x.tone}`}>
          {x.tone === "error" ? <XCircle size={18} color="var(--danger)" /> : <CheckCircle2 size={18} color="var(--accent)" />}
          <span>{x.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Fehler eines Befehls als Toast mit verständlichem Text. */
export function toastError(e: unknown) {
  const err = e as { code?: string; message?: string };
  const d = describeError(err.code ?? "error");
  toast(`${d.title}${d.action ? ` – ${d.action}` : ""}`, "error");
}
