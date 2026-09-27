import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { sound } from '../lib/sound';
import { serverNow } from '../state/store';
import { t } from '../i18n/de';

/* ------------------------------------------------------------------ */
/* Icons (eigene, minimalistische SVGs)                                */
/* ------------------------------------------------------------------ */

const PATHS: Record<string, string> = {
  crown: 'M3 18h18l-1.5-9-4.5 4-3-7-3 7-4.5-4z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4L10.6 6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4z',
  wifiOff: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M19 13a10 10 0 0 0-2.5-1.8M2 9.5a15 15 0 0 1 4.5-2.8M22 9.5A15 15 0 0 0 11 5.1M12 20h.01',
  wifi: 'M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 14 0M2 9.5a15 15 0 0 1 20 0M12 20h.01',
  play: 'M7 4.5v15l13-7.5z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  heart: 'M12 20.5s-8-4.9-8-11A4.5 4.5 0 0 1 12 6.8a4.5 4.5 0 0 1 8 2.7c0 6.1-8 11-8 11z',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  speaker: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6',
  users: 'M16 19v-1.5A3.5 3.5 0 0 0 12.5 14h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.4M15.5 5.2a3 3 0 0 1 0 5.6',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7.5h.01',
  refresh: 'M20 11a8 8 0 0 0-14.8-3.7L3 10M4 13a8 8 0 0 0 14.8 3.7L21 14M3 4v6h6M21 20v-6h-6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8.5 20h7M10 17h4',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M16 9h4M4 15h4M16 15h4',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v5l3 2',
  robot: 'M7 9h10v9H7zM12 5v4M9.5 13h.01M14.5 13h.01M4 13h3M17 13h3',
  circle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  chevronDown: 'M6 9l6 6 6-6'
};

export function Icon({ name, size = 20, stroke = 2, className }: { name: keyof typeof PATHS | string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Avatare                                                             */
/* ------------------------------------------------------------------ */

export const AVATAR_EMOJI: Record<string, string> = {
  fox: '🦊', owl: '🦉', cat: '🐱', frog: '🐸', panda: '🐼', tiger: '🐯', koala: '🐨', octopus: '🐙',
  unicorn: '🦄', alien: '👽', robot: '🤖', ghost: '👻', penguin: '🐧', dragon: '🐲', bee: '🐝', shark: '🦈'
};

const AVATAR_HUE: Record<string, number> = {
  fox: 24, owl: 35, cat: 280, frog: 130, panda: 220, tiger: 40, koala: 200, octopus: 330,
  unicorn: 300, alien: 110, robot: 190, ghost: 260, penguin: 210, dragon: 150, bee: 50, shark: 195
};

export function Avatar({ avatar, size = 56, ring, label }: { avatar: string; size?: number; ring?: 'violet' | 'cyan' | 'success' | 'danger' | 'gold'; label?: string }) {
  const hue = AVATAR_HUE[avatar] ?? 270;
  return (
    <span
      className={`avatar ${ring ? `ring-${ring}` : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.56,
        background: `radial-gradient(circle at 30% 25%, hsl(${hue} 70% 64%), hsl(${hue} 55% 38%) 75%)`
      }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {AVATAR_EMOJI[avatar] ?? '🙂'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons & Controls                                                  */
/* ------------------------------------------------------------------ */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'cyan' | 'quiet';
  size?: 'md' | 'lg' | 'xl' | 'sm';
  icon?: string;
  iconRight?: string;
  children?: ReactNode;
};

export function Button({ variant = 'secondary', size = 'md', icon, iconRight, children, className = '', onClick, onMouseEnter, type = 'button', ...rest }: BtnProps) {
  const iconSize = size === 'xl' ? 22 : size === 'lg' ? 20 : size === 'sm' ? 15 : 18;
  return (
    <button
      type={type}
      className={`btn btn-${variant} btn-${size} ${className}`}
      onMouseEnter={(e) => {
        if (!rest.disabled) sound.hover();
        onMouseEnter?.(e);
      }}
      onClick={(e) => {
        sound.unlock();
        sound.click();
        onClick?.(e);
      }}
      {...rest}
    >
      {icon && <Icon name={icon} size={iconSize} />}
      {children && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, disabled, label }: { value: T; options: { value: T; label: string }[]; onChange(v: T): void; disabled?: boolean; label: string }) {
  return (
    <div className={`segmented ${disabled ? 'is-disabled' : ''}`} role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          className={o.value === value ? 'active' : ''}
          onClick={() => {
            sound.click();
            onChange(o.value);
          }}
        >
          {o.value === value && <Icon name="check" size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange(v: boolean): void; label: string; hint?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-checked={checked} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <span className="toggle-state" aria-hidden="true">{checked ? t.common.on : t.common.off}</span>
    </label>
  );
}

export function Panel({ children, className = '', title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          {title && <h3 className="panel-title">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Hinweisbox – Bedeutung über Symbol und Text, nicht nur über Farbe. */
export function Callout({ tone = 'info', title, children, actions }: { tone?: 'info' | 'warn' | 'error' | 'success'; title?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  const icon = tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'alert';
  return (
    <div className={`callout callout-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} size={18} className="callout-icon" />
      <div className="callout-body">
        {title && <strong className="callout-title">{title}</strong>}
        {children && <div className="callout-text">{children}</div>}
        {actions && <div className="callout-actions">{actions}</div>}
      </div>
    </div>
  );
}

/** Aufklappbarer Bereich (z. B. „Erweitert“, „Mehr erfahren“). */
export function Disclosure({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="disclosure" open={defaultOpen}>
      <summary>
        <Icon name="chevronDown" size={16} className="disclosure-chevron" />
        {summary}
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

export function ModeBadge({ mode, solo }: { mode: 'tiktok' | 'demo'; solo?: boolean }) {
  const text = solo ? t.lobby.soloBadge : mode === 'demo' ? t.lobby.demoBadge : t.lobby.tiktokBadge;
  return (
    <span className={`mode-badge mode-${solo ? 'solo' : mode}`}>
      <Icon name={mode === 'tiktok' ? 'heart' : 'film'} size={14} /> {text}
    </span>
  );
}

/** Kleine Kennzeichnung für simulierte Mitspieler. */
export function SimBadge() {
  return (
    <span className="sim-badge" title={t.common.simulated}>
      <Icon name="robot" size={12} /> {t.common.simulated}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog mit Fokusführung                                              */
/* ------------------------------------------------------------------ */

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** `focusKey`: Wechselt der Inhalt (z. B. Schritt eines Assistenten), wird der Fokus neu gesetzt. */
export function Dialog({ title, onClose, children, footer, wide, focusKey }: { title: string; onClose(): void; children: ReactNode; footer?: ReactNode; wide?: boolean; focusKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    const first =
      (el.querySelector('[data-autofocus], input:not([disabled])') as HTMLElement | null) ?? (el.querySelector(FOCUSABLE) as HTMLElement | null);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const a = items[0]!;
      const b = items[items.length - 1]!;
      if (!el.contains(document.activeElement)) {
        e.preventDefault();
        a.focus();
      } else if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        b.focus();
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);
  useEffect(() => {
    if (focusKey === undefined) return;
    const el = ref.current!;
    ((el.querySelector('[data-autofocus]') as HTMLElement | null) ?? (el.querySelector(FOCUSABLE) as HTMLElement | null))?.focus();
  }, [focusKey]);
  const id = `dlg-${title.replace(/\W+/g, '-')}`;
  // Portal: Dialoge liegen immer über Reaktionen, Toasts und Hintergrund.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="modal-head">
          <h3 id={id}>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t.common.close}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* Zeit                                                                */
/* ------------------------------------------------------------------ */

/** Tickt mit gegebener Rate und liefert die abgeglichene Serverzeit. */
export function useServerNow(intervalMs = 100): number {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const h = window.setInterval(() => setNow(serverNow()), intervalMs);
    return () => window.clearInterval(h);
  }, [intervalMs]);
  return now;
}

export function TimerRing({ endsAt, totalMs, size = 76 }: { endsAt: number; totalMs: number; size?: number }) {
  const now = useServerNow(100);
  const left = Math.max(0, endsAt - now);
  const frac = totalMs > 0 ? left / totalMs : 0;
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const urgent = left < 5000;
  return (
    <div className={`timer-ring ${urgent ? 'urgent' : ''}`} style={{ width: size, height: size }} role="timer" aria-label={`Noch ${Math.ceil(left / 1000)} Sekunden`}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="timer-bg" />
        <circle cx={size / 2} cy={size / 2} r={r} className="timer-fg" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span>{Math.ceil(left / 1000)}</span>
    </div>
  );
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Kurzlebige „Gespeichert“-Bestätigung. */
export function useSavedFlash(ms = 1800): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);
  return [
    on,
    () => {
      setOn(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setOn(false), ms);
    }
  ];
}
