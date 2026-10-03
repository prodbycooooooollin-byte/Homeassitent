import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { connection, useConnection, type ConnState } from '../net/connection.ts';
import { IconWifiOff } from './Icons.tsx';

function useTick(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export interface StatusText {
  tone: 'ok' | 'wait' | 'warn' | 'error';
  title: string;
  detail: string | null;
}

/** Verständliche Beschreibung des Verbindungszustands. */
export function describeConnection(c: ConnState, now = Date.now()): StatusText {
  const waited = c.attemptStartedAt ? now - c.attemptStartedAt : 0;
  const retryIn = c.nextRetryAt ? Math.max(1, Math.ceil((c.nextRetryAt - now) / 1000)) : null;
  switch (c.status) {
    case 'online':
      return { tone: 'ok', title: 'Verbunden', detail: null };
    case 'unreachable':
      return {
        tone: 'error',
        title: 'Server momentan nicht erreichbar',
        detail: 'Prüfe deine Internetverbindung und versuche es erneut.',
      };
    case 'reconnecting':
      return {
        tone: 'warn',
        title: 'Verbindung unterbrochen – erneuter Versuch läuft',
        detail: retryIn ? `Nächster Versuch in ${retryIn} s` : 'Verbinde …',
      };
    case 'connecting':
    case 'idle':
    default:
      return {
        tone: 'wait',
        title: 'Verbindung wird hergestellt …',
        detail:
          c.failures > 0 || waited > 5000
            ? 'Der Spielserver startet gerade. Das kann beim ersten Aufruf bis zu einer Minute dauern.'
            : null,
      };
  }
}

/** Kompakte Statuszeile (z. B. auf der Startseite). */
export function ConnectionLine() {
  const c = useConnection();
  useTick(1000);
  const s = describeConnection(c);
  return (
    <div className={`conn-line tone-${s.tone}`} role="status" aria-live="polite">
      <span className="dot" aria-hidden="true" />
      <span className="conn-line-text">
        <strong>{s.title}</strong>
        {s.detail && <span className="conn-line-detail"> · {s.detail}</span>}
      </span>
      {c.status === 'unreachable' && (
        <button className="btn btn-small btn-primary" onClick={() => connection.retryNow()}>
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

/** Banner oben, sobald eine bestehende Sitzung die Verbindung verliert oder der Server nicht antwortet. */
export function ConnectionBanner({ show }: { show: boolean }) {
  const c = useConnection();
  useTick(1000);
  const s = describeConnection(c);
  const visible = show && (c.status === 'reconnecting' || c.status === 'unreachable');
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`conn-banner tone-${s.tone}`}
          role="alert"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
        >
          <IconWifiOff size={18} />
          <span>
            <strong>{s.title}</strong>
            {s.detail && <span className="conn-banner-detail"> · {s.detail}</span>}
          </span>
          {(c.status === 'unreachable' || c.status === 'reconnecting') && (
            <button className="btn btn-small btn-ghost" onClick={() => connection.retryNow()}>
              {c.status === 'unreachable' ? 'Erneut versuchen' : 'Jetzt versuchen'}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
