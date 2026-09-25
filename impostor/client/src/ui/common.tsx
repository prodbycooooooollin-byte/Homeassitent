import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { connection } from '../net/connection.ts';
import { IconX } from './Icons.tsx';

// ---------------------------------------------------------------------------
// Kartenrückseite: eigenes Muster, für alle Rollen identisch.

export function CardBack({ small = false }: { small?: boolean }) {
  const pid = useId().replace(/:/g, '');
  return (
    <svg className="card-back-art" viewBox="0 0 120 168" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id={`lat-${pid}`} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="16" height="16" fill="#151c33" />
          <path d="M0 8h16M8 0v16" stroke="#243056" strokeWidth="1.2" />
          <circle cx="8" cy="8" r="1.4" fill="#2f8f8a" />
        </pattern>
        <radialGradient id={`glow-${pid}`} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#3fd8c8" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#3fd8c8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="120" height="168" fill={`url(#lat-${pid})`} />
      <rect width="120" height="168" fill={`url(#glow-${pid})`} />
      <rect x="7" y="7" width="106" height="154" rx="9" fill="none" stroke="#e8dcc4" strokeOpacity="0.55" strokeWidth="1.5" />
      <rect x="11" y="11" width="98" height="146" rx="7" fill="none" stroke="#3fd8c8" strokeOpacity="0.35" strokeWidth="1" />
      {!small && (
        <g transform="translate(60 84)">
          <path d="M-30 -6c0-14 12-22 30-22s30 8 30 22c0 12-10 24-30 24S-30 6-30 -6z" fill="#f5eee0" stroke="#0e1324" strokeWidth="2.5" />
          <path d="M-20 -6q6-7 12 0q-6 5-12 0z" fill="#0e1324" />
          <path d="M8 -6q6-7 12 0q-6 5-12 0z" fill="#0e1324" />
          <path d="M-6 8q6 4 12 0" stroke="#ff6f61" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M-36 -32l6 8M36 -32l-6 8" stroke="#3fd8c8" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        </g>
      )}
    </svg>
  );
}

export function Logo({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  return (
    <div className={`logo logo-${size}`} aria-label="Impostor">
      <span className="logo-mask" aria-hidden="true">
        <svg viewBox="0 0 64 40">
          <path d="M4 18C4 8 16 3 32 3s28 5 28 15c0 11-10 19-28 19S4 29 4 18z" fill="#f5eee0" stroke="#0e1324" strokeWidth="3" />
          <path d="M14 18q6-7 12 0q-6 5-12 0zM38 18q6-7 12 0q-6 5-12 0z" fill="#0e1324" />
          <path d="M27 28q5 3 10 0" stroke="#ff6f61" strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
      </span>
      <span className="logo-word">IMPOSTOR</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog mit Fokusfalle und Esc

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
  tone = 'default',
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  tone?: 'default' | 'danger';
  dismissable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const t = window.setTimeout(() => {
      const first = el?.querySelector<HTMLElement>('[data-autofocus], input, button:not([disabled]), [href], select, textarea');
      first?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>('button:not([disabled]), input, [href], select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open, onClose, dismissable]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && dismissable) onClose();
          }}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`dialog paper ${wide ? 'dialog-wide' : ''} tone-${tone}`}
            initial={{ opacity: 0, y: 24, scale: 0.96, rotateX: 8 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            <header className="dialog-head">
              <h2 id={titleId}>{title}</h2>
              {dismissable && (
                <button className="icon-btn ink" onClick={onClose} aria-label="Schließen">
                  <IconX />
                </button>
              )}
            </header>
            <div className="dialog-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Toasts

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
}
let toasts: Toast[] = [];
let toastSeq = 0;
const toastListeners = new Set<() => void>();
function emitToasts() {
  toastListeners.forEach((l) => l());
}

export function toast(text: string, tone: Toast['tone'] = 'info', ms = 3800) {
  const id = ++toastSeq;
  toasts = [...toasts.filter((t) => t.text !== text), { id, text, tone }].slice(-4);
  emitToasts();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emitToasts();
  }, ms);
}

export function Toasts() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast toast-${t.tone}`}
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zeit

/** Rendert periodisch neu und liefert die geschätzte Serverzeit. */
export function useServerNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => connection.serverNow());
  useEffect(() => {
    const t = window.setInterval(() => setNow(connection.serverNow()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function remainingMs(deadline: number | null, now: number): number | null {
  if (deadline === null) return null;
  return Math.max(0, deadline - now);
}

export function TimerRing({
  remaining,
  total,
  size = 44,
  paused = false,
  label,
}: {
  remaining: number | null;
  total: number | null;
  size?: number;
  paused?: boolean;
  label?: string;
}) {
  const secs = remaining === null ? null : Math.ceil(remaining / 1000);
  const frac = remaining !== null && total ? Math.max(0, Math.min(1, remaining / total)) : 1;
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const urgent = secs !== null && secs <= 5 && !paused;
  return (
    <div
      className={`timer-ring ${urgent ? 'urgent' : ''} ${paused ? 'paused' : ''}`}
      style={{ width: size, height: size }}
      role="timer"
      aria-label={label ?? (secs === null ? 'Kein Zeitlimit' : `${secs} Sekunden`)}
    >
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="timer-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="timer-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="timer-num">{secs === null ? '∞' : secs}</span>
    </div>
  );
}

export function useReducedMotionPref(setting: 'system' | 'on' | 'off'): boolean {
  const [sys, setSys] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setSys(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return setting === 'on' || (setting === 'system' && sys);
}
