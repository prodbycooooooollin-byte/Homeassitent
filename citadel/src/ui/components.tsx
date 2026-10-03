import { useEffect, useRef, useState, type ReactNode } from 'react';
import { compactDiff, lineDiff } from '../core/diff.ts';

// ---------------------------------------------------------------- Icons (eigene, schlichte Linien)

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const Icons = {
  overview: <svg viewBox="0 0 24 24" {...P}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  studio: <svg viewBox="0 0 24 24" {...P}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>,
  optimize: <svg viewBox="0 0 24 24" {...P}><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><circle cx="12" cy="12" r="5" /><path d="M12 9.5v2.5l1.8 1.2" /></svg>,
  crosshair: <svg viewBox="0 0 24 24" {...P}><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /><circle cx="12" cy="12" r="1" /></svg>,
  players: <svg viewBox="0 0 24 24" {...P}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" /><path d="M16 5.5a3 3 0 010 5.6M18 14.5c1.3.8 2.2 2.3 2.5 4.5" /></svg>,
  bench: <svg viewBox="0 0 24 24" {...P}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  backups: <svg viewBox="0 0 24 24" {...P}><path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z" /><path d="M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5" /></svg>,
  settings: <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>,
  info: <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></svg>,
  warn: <svg viewBox="0 0 24 24" {...P}><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17v.5" /></svg>,
  check: <svg viewBox="0 0 24 24" {...P}><path d="M4 12.5l5 5L20 6.5" /></svg>,
  x: <svg viewBox="0 0 24 24" {...P}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  copy: <svg viewBox="0 0 24 24" {...P}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></svg>,
  star: <svg viewBox="0 0 24 24" {...P}><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>,
  starFill: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>,
  folder: <svg viewBox="0 0 24 24" {...P}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>,
  undo: <svg viewBox="0 0 24 24" {...P}><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></svg>,
  link: <svg viewBox="0 0 24 24" {...P}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></svg>,
  refresh: <svg viewBox="0 0 24 24" {...P}><path d="M20 12a8 8 0 11-2.3-5.7L20 8.5" /><path d="M20 3.5v5h-5" /></svg>,
};

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#1f201f" stroke="#b08d57" strokeOpacity=".6" />
      <g stroke="#5fbf9f" strokeWidth="4" strokeLinecap="square">
        <line x1="32" y1="12" x2="32" y2="24" />
        <line x1="32" y1="40" x2="32" y2="52" />
        <line x1="12" y1="32" x2="24" y2="32" />
        <line x1="40" y1="32" x2="52" y2="32" />
      </g>
      <circle cx="32" cy="32" r="3" fill="#efe9dc" />
    </svg>
  );
}

// ---------------------------------------------------------------- Kleinteile

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode }) {
  return (
    <div className={`notice ${kind === 'info' ? '' : kind}`} role={kind === 'danger' ? 'alert' : 'status'}>
      {kind === 'ok' ? Icons.check : kind === 'info' ? Icons.info : Icons.warn}
      <div>{children}</div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={wide ? { width: 'min(1180px, 95vw)' } : undefined}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Schließen">
            {Icons.x}
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function DiffView({ before, after, context = 2 }: { before: string; after: string; context?: number }) {
  const lines = compactDiff(lineDiff(before, after), context);
  if (!lines.some((l) => l.kind === 'add' || l.kind === 'del')) return <div className="muted small">Keine Textänderungen.</div>;
  return (
    <div className="diff" role="region" aria-label="Textunterschiede">
      {lines.map((l, i) =>
        l.kind === 'gap' ? (
          <div key={i} className="diff-gap">… {l.count} unveränderte Zeilen</div>
        ) : (
          <div key={i} className={`diff-line ${l.kind}`}>
            <span>{l.oldNo ?? ''}</span>
            <span>{l.newNo ?? ''}</span>
            <span>{(l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : '  ') + l.text}</span>
          </div>
        ),
      )}
    </div>
  );
}

export function FileDrop({ onFiles, children, accept }: { onFiles: (files: File[]) => void; children: ReactNode; accept?: string }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
    >
      {children}
      <div style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={() => input.current?.click()}>
          Datei auswählen …
        </button>
        <input ref={input} type="file" multiple hidden accept={accept} onChange={(e) => e.target.files && onFiles([...e.target.files])} />
      </div>
    </div>
  );
}

export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return 'unbekannt';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-DE', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

export function Copy({ text, label = 'Kopieren' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? Icons.check : Icons.copy}
      {done ? 'Kopiert' : label}
    </button>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
