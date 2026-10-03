import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { inviteLink } from '../../../shared/server.ts';
import { play } from '../audio/sound.ts';
import { useConnection } from '../net/connection.ts';
import { Dialog, toast } from './common.tsx';
import { IconCheck, IconCopy, IconLink } from './Icons.tsx';

/** Kopiert Text und zeigt direkt am Button eine kurze Bestätigung. */
export function CopyButton({ text, label, className = 'btn btn-small btn-ghost', icon = 'copy' }: { text: string; label: string; className?: string; icon?: 'copy' | 'link' }) {
  const [done, setDone] = useState(false);
  const run = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      play('click');
      window.setTimeout(() => setDone(false), 2000);
    } catch {
      toast('Kopieren nicht möglich – bitte manuell markieren und kopieren.', 'error');
    }
  };
  return (
    <button className={`${className} ${done ? 'is-done' : ''}`} onClick={run} aria-live="polite">
      {done ? <IconCheck size={16} /> : icon === 'link' ? <IconLink size={16} /> : <IconCopy size={16} />}
      {done ? 'Kopiert!' : label}
    </button>
  );
}

/** QR-Code als SVG (ohne innerHTML, CSP-freundlich). */
export function QrCode({ text, size = 176 }: { text: string; size?: number }) {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { count: n, path: d };
  }, [text]);
  const q = 4; // Ruhezone
  return (
    <svg className="qr" width={size} height={size} viewBox={`${-q} ${-q} ${count + 2 * q} ${count + 2 * q}`} role="img" aria-label="QR-Code zum Beitreten im Browser" shapeRendering="crispEdges">
      <rect x={-q} y={-q} width={count + 2 * q} height={count + 2 * q} fill="#fff" />
      <path d={path} fill="#111" />
    </svg>
  );
}

export function useInviteLink(code: string): string {
  const conn = useConnection();
  return inviteLink(conn.endpoint, code);
}

export function InviteDialog({ open, onClose, code }: { open: boolean; onClose: () => void; code: string }) {
  const link = useInviteLink(code);
  return (
    <Dialog open={open} onClose={onClose} title="Freunde einladen">
      <div className="invite">
        <div className="invite-qr">
          <QrCode text={link} />
          <span className="muted small">Mit dem Handy scannen – öffnet die Browser-Version.</span>
        </div>
        <div className="invite-info">
          <span className="field-label">Lobby-Code</span>
          <div className="invite-code" aria-label={`Lobby-Code ${code.split('').join(' ')}`}>
            {code}
          </div>
          <CopyButton text={code} label="Code kopieren" />
          <span className="field-label">Einladungslink</span>
          <input className="text-input invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Einladungslink" />
          <CopyButton text={link} label="Einladungslink kopieren" className="btn btn-primary" icon="link" />
          <p className="muted small">
            Mit der Windows-App: „Lobby beitreten“ und den Code eingeben. Im Browser führt der Link durch Profilwahl und Beitritt.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
