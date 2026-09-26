import { motion } from 'motion/react';
import type { PrivateView } from '../../../shared/protocol.ts';
import { CardBack } from '../ui/common.tsx';

/** Länge des längsten Wortteils – für automatische Schriftgröße ohne Silbenbruch. */
function longestPart(word: string): number {
  return Math.max(6, ...word.split(/[\s-]+/).map((w) => w.length));
}

export function RoleCardFace({ priv, categoryHint }: { priv: PrivateView; categoryHint: string | null }) {
  const impostor = priv.role === 'impostor';
  return (
    <div className={`role-face paper ${impostor ? 'role-impostor' : 'role-insider'}`}>
      <span className="role-corner" aria-hidden="true">
        {impostor ? '✕' : '◆'}
      </span>
      <span className="role-kicker">{impostor ? 'Deine Rolle' : 'Du kennst das Wort'}</span>
      {impostor ? (
        <>
          <span className="role-title">Du bist der Impostor</span>
          <span className="role-text">
            Du kennst das Wort nicht. Lies die Hinweise, gib einen glaubwürdigen eigenen – oder rate das Wort. Du hast genau einen Versuch.
          </span>
        </>
      ) : (
        <>
          <span className="role-word" style={{ '--len': longestPart(priv.word ?? '') } as React.CSSProperties}>
            {priv.word}
          </span>
          <span className="role-text">Gib passende Hinweise, ohne das Wort zu verraten. Finde heraus, wer es nicht kennt.</span>
        </>
      )}
      {categoryHint && <span className="role-cat">Kategorie: {categoryHint}</span>}
      <span className="role-corner bottom" aria-hidden="true">
        {impostor ? '✕' : '◆'}
      </span>
    </div>
  );
}

/**
 * Rollenkarte mit sauberem 3D-Flip. Vorder- und Rückseite haben für beide
 * Rollen exakt dieselbe Größe, Animation und denselben Klang.
 */
export function FlipCard({
  flipped,
  priv,
  categoryHint,
  className = '',
  onClick,
  label,
}: {
  flipped: boolean;
  priv: PrivateView;
  categoryHint: string | null;
  className?: string;
  onClick?: () => void;
  label: string;
}) {
  const inner = (
    <motion.div
      className="flip-inner"
      animate={{ rotateY: flipped ? 180 : 0 }}
      transition={{ duration: 0.5, ease: [0.3, 0.9, 0.3, 1] }}
    >
      <div className="flip-side flip-back">
        <CardBack />
      </div>
      <div className="flip-side flip-front" aria-hidden={!flipped}>
        {flipped && <RoleCardFace priv={priv} categoryHint={categoryHint} />}
      </div>
    </motion.div>
  );
  return onClick ? (
    <button className={`flip-card ${className}`} onClick={onClick} aria-label={label}>
      {inner}
    </button>
  ) : (
    <div className={`flip-card ${className}`} aria-label={label} role="img">
      {inner}
    </div>
  );
}
