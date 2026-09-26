import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { sound } from '../lib/sound';
import { serverNow } from '../state/store';

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
  heart: 'M12 20.5s-8-4.9-8-11A4.5 4.5 0 0 1 12 6.8a4.5 4.5 0 0 1 8 2.7c0 6.1-8 11-8 11z',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  speaker: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6',
  users: 'M16 19v-1.5A3.5 3.5 0 0 0 12.5 14h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.4M15.5 5.2a3 3 0 0 1 0 5.6',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  refresh: 'M20 11a8 8 0 0 0-14.8-3.7L3 10M4 13a8 8 0 0 0 14.8 3.7L21 14M3 4v6h6M21 20v-6h-6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8.5 20h7M10 17h4'
};

export function Icon({ name, size = 20, stroke = 2, className }: { name: keyof typeof PATHS | string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

export function Avatar({ avatar, size = 56, ring }: { avatar: string; size?: number; ring?: 'violet' | 'cyan' | 'success' | 'danger' | 'gold' }) {
  const hue = AVATAR_HUE[avatar] ?? 270;
  return (
    <span
      className={`avatar ${ring ? `ring-${ring}` : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.56,
        background: `radial-gradient(circle at 30% 25%, hsl(${hue} 80% 62%), hsl(${hue} 70% 32%) 70%)`
      }}
      aria-hidden="true"
    >
      {AVATAR_EMOJI[avatar] ?? '🙂'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'cyan';
  size?: 'md' | 'lg' | 'xl' | 'sm';
  icon?: string;
  children?: ReactNode;
};

export function Button({ variant = 'secondary', size = 'md', icon, children, className = '', onClick, onMouseEnter, ...rest }: BtnProps) {
  return (
    <button
      type="button"
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
      {icon && <Icon name={icon} size={size === 'xl' ? 26 : size === 'lg' ? 22 : 18} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, disabled, label }: { value: T; options: { value: T; label: string }[]; onChange(v: T): void; disabled?: boolean; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
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
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function Panel({ children, className = '', title }: { children: ReactNode; className?: string; title?: ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      {title && <h3 className="panel-title">{title}</h3>}
      {children}
    </section>
  );
}

export function DemoBadge({ text }: { text: string }) {
  return (
    <span className="demo-badge" role="note">
      <Icon name="alert" size={14} /> {text}
    </span>
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

export function TimerRing({ endsAt, totalMs, size = 84 }: { endsAt: number; totalMs: number; size?: number }) {
  const now = useServerNow(100);
  const left = Math.max(0, endsAt - now);
  const frac = totalMs > 0 ? left / totalMs : 0;
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const urgent = left < 5000;
  return (
    <div className={`timer-ring ${urgent ? 'urgent' : ''}`} style={{ width: size, height: size }} role="timer" aria-label={`${Math.ceil(left / 1000)} Sekunden`}>
      <svg width={size} height={size}>
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
