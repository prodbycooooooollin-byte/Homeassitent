import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import type { PlayerPublic } from '../../../shared/protocol.ts';
import { Avatar } from './Avatar.tsx';
import { IconCheck, IconCrown, IconWifiOff, IconX } from './Icons.tsx';

export interface SeatPos {
  x: number; // Prozent
  y: number; // Prozent
  angle: number; // Grad, 0 = unten (eigener Platz)
}

/**
 * Sitzplätze entlang einer Ellipse. Der eigene Platz ist unten verankert,
 * die zyklische Sitzreihenfolge läuft im Uhrzeigersinn um den Tisch.
 */
export function seatPositions(count: number, rx = 41, ry = 38): SeatPos[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (360 * i) / count;
    const rad = (angle * Math.PI) / 180;
    return { x: 50 - rx * Math.sin(rad), y: 50 + ry * Math.cos(rad), angle };
  });
}

/** Rotiert die Sitzordnung so, dass `meId` an Position 0 (unten) sitzt. */
export function rotateToMe<T extends string>(order: T[], meId: string): T[] {
  const i = order.indexOf(meId as T);
  if (i < 0) return order;
  return [...order.slice(i), ...order.slice(0, i)];
}

export interface SeatFlags {
  isMe?: boolean;
  active?: boolean;
  ready?: boolean;
  acked?: boolean;
  voted?: boolean;
  supporter?: boolean;
  selectable?: boolean;
  selected?: boolean;
  dim?: boolean;
  showScore?: boolean;
  caption?: string;
  badge?: ReactNode;
  revealRole?: 'impostor' | 'insider' | null;
}

export function SeatCard({
  player,
  flags,
  onSelect,
  onKick,
  enterFrom,
}: {
  player: PlayerPublic;
  flags: SeatFlags;
  onSelect?: () => void;
  onKick?: () => void;
  enterFrom?: { x: number; y: number };
}) {
  const classes = [
    'seat-card',
    'paper',
    flags.isMe && 'is-me',
    flags.active && 'active',
    flags.selectable && 'selectable',
    flags.selected && 'selected',
    !player.connected && 'offline',
    flags.dim && 'dim',
    flags.revealRole && `reveal-${flags.revealRole}`,
  ]
    .filter(Boolean)
    .join(' ');

  const statusLabel = [
    player.isHost ? 'Host' : null,
    !player.connected ? 'Verbindung getrennt' : null,
    flags.ready ? 'bereit' : null,
    flags.acked ? 'Rolle bestätigt' : null,
    flags.voted ? 'hat abgestimmt' : null,
    flags.active ? 'ist am Zug' : null,
    flags.supporter ? 'unterstützt Abstimmung' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <>
      {player.isHost && (
        <span className="seat-host" title="Host" aria-hidden="true">
          <IconCrown size={14} />
        </span>
      )}
      <Avatar id={player.avatar} size={52} title={player.name} />
      <span className="pc-name" title={player.name}>
        {player.name}
      </span>
      {flags.isMe && <span className="me-tag">du</span>}
      <span className="seat-status" aria-hidden="true">
        {!player.connected && (
          <span className="chip chip-warn">
            <IconWifiOff size={12} /> getrennt
          </span>
        )}
        {flags.caption && <span className="chip">{flags.caption}</span>}
        {flags.showScore && <span className="chip chip-score">{player.score} P</span>}
      </span>
      <AnimatePresence>
        {(flags.ready || flags.acked) && (
          <motion.span
            className="seat-stamp"
            initial={{ scale: 2.2, opacity: 0, rotate: -30 }}
            animate={{ scale: 1, opacity: 1, rotate: -8 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
            aria-hidden="true"
          >
            <IconCheck size={16} />
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {flags.voted && (
          <motion.span
            className="seat-vote-card"
            initial={{ y: -30, rotate: -25, opacity: 0 }}
            animate={{ y: 0, rotate: 8, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 24 }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
      {flags.supporter && (
        <span className="seat-hand" aria-hidden="true">
          ✋
        </span>
      )}
      {flags.badge}
    </>
  );

  return (
    <motion.div
      className="seat"
      initial={enterFrom ? { opacity: 0, scale: 0.7, x: enterFrom.x, y: enterFrom.y } : false}
      animate={{ opacity: 1, scale: 1, x: 0, y: flags.active ? -14 : 0 }}
      exit={{ opacity: 0, scale: 0.6, y: 40 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
    >
      {onSelect ? (
        <button className={classes} onClick={onSelect} aria-pressed={flags.selected} aria-label={`${player.name} wählen. ${statusLabel}`}>
          {content}
        </button>
      ) : (
        <div className={classes} aria-label={`${player.name}${statusLabel ? `: ${statusLabel}` : ''}`} role="group">
          {content}
        </div>
      )}
      {onKick && (
        <button className="seat-kick" onClick={onKick} aria-label={`${player.name} entfernen`} title="Entfernen">
          <IconX size={14} />
        </button>
      )}
    </motion.div>
  );
}

export function EmptySeat() {
  return (
    <motion.div className="seat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="seat-card seat-empty" aria-label="Freier Platz" role="group">
        <span className="empty-plus" aria-hidden="true">
          +
        </span>
        <span className="pc-name">Freier Platz</span>
      </div>
    </motion.div>
  );
}

/** Tischfläche mit Filz, Rand und Beleuchtung. */
export function TableSurface({ mood = 'calm', children }: { mood?: 'calm' | 'discussion' | 'voting' | 'reveal'; children?: ReactNode }) {
  return (
    <div className={`table-surface mood-${mood}`}>
      <div className="table-rim" aria-hidden="true" />
      <div className="table-felt" aria-hidden="true" />
      <div className="table-light" aria-hidden="true" />
      {children}
    </div>
  );
}

export function SeatSlot({ pos, children, z }: { pos: SeatPos; children: ReactNode; z?: number }) {
  return (
    <div className="seat-slot" style={{ left: `${pos.x}%`, top: `${pos.y}%`, zIndex: z ?? Math.round(pos.y) }}>
      {children}
    </div>
  );
}
