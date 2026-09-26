import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import type { RoomView, ScoreEntry } from '@liked/protocol';
import { t } from '../i18n/de';
import { actions } from '../lib/net';
import { sound } from '../lib/sound';
import { useStore } from '../state/store';
import { Avatar, Button, Icon } from '../components/ui';
import { MiniStandings, RoundHeader } from './Round';

/** Auflösung: kurze Spannung → „Das war …“ → Tipps, Korrektheit, Ränge, Punkte, Serien. */
export function RevealScreen({ view }: { view: RoomView }) {
  const reveal = view.reveal!;
  const reduced = useStore((s) => s.reducedMotion);
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const owner = view.players.find((p) => p.id === reveal.ownerId);
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const mine = reveal.votes.find((v) => v.voterId === view.youId);

  useEffect(() => {
    sound.once(`suspense:${reveal.roundId}`, () => sound.suspense());
    const a = window.setTimeout(() => {
      setStage(1);
      sound.once(`reveal:${reveal.roundId}`, () => sound.reveal());
    }, reduced ? 400 : 1200);
    const b = window.setTimeout(() => {
      setStage(2);
      sound.once(`result:${reveal.roundId}`, () => {
        if (!mine) return;
        if (mine.correct) {
          sound.correct();
          if (mine.streak >= 2) window.setTimeout(() => sound.streak(mine.streak), 250);
          window.setTimeout(() => sound.points(), 500);
        } else sound.wrong();
      });
    }, reduced ? 900 : 2300);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [reveal.roundId]);

  const sorted = [...reveal.votes].sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99));

  return (
    <div className="screen reveal-screen">
      <RoundHeader view={view} />
      <div className="reveal-center">
        <AnimatePresence mode="wait">
          {stage === 0 ? (
            <motion.div key="suspense" className="suspense" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <div className="suspense-pulse" />
              <h2>{t.reveal.suspense}</h2>
            </motion.div>
          ) : (
            <motion.div key="owner" className="reveal-owner" initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: -8 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
              <p className="muted">{t.reveal.itWas}</p>
              <Avatar avatar={owner?.avatar ?? 'ghost'} size={140} ring="violet" />
              <h2 className="reveal-name">{owner?.name ?? '?'}</h2>
            </motion.div>
          )}
        </AnimatePresence>

        {stage === 2 && (
          <motion.ul className="reveal-votes" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: reduced ? 0 : 0.12 } } }}>
            {sorted.map((v) => {
              const voter = byId.get(v.voterId);
              const target = v.targetId ? byId.get(v.targetId) : null;
              return (
                <motion.li key={v.voterId} className={`reveal-vote ${v.correct ? 'ok' : 'bad'} ${v.voterId === view.youId ? 'me' : ''}`} variants={{ hidden: { opacity: 0, x: 30 }, show: { opacity: 1, x: 0 } }}>
                  <Avatar avatar={voter?.avatar ?? 'ghost'} size={40} />
                  <span className="nm">{voter?.name}</span>
                  <span className="arrow">→</span>
                  <span className="target">{target ? target.name : t.reveal.noVote}</span>
                  <span className={`verdict ${v.correct ? 'ok' : 'bad'}`}>
                    <Icon name={v.correct ? 'check' : 'x'} size={16} /> {v.correct ? t.reveal.correct : v.targetId ? t.reveal.wrong : t.reveal.noVote}
                  </span>
                  {v.rank && <span className="rank">{t.reveal.rank(v.rank)}</span>}
                  {v.streak >= 2 && <span className="streak-chip">🔥 {t.reveal.streak(v.streak)} ×{v.multiplier.toFixed(2).replace('.', ',')}</span>}
                  <motion.span className="points" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: reduced ? 0 : 0.35 }}>
                    {v.points > 0 ? t.reveal.points(v.points) : '0'}
                  </motion.span>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </div>
    </div>
  );
}

/** Zwischenstand mit animierten Positionswechseln. */
export function ScoreboardScreen({ view }: { view: RoomView }) {
  const reveal = view.reveal;
  const gained = useMemo(() => new Map((reveal?.votes ?? []).filter((v) => v.points > 0).map((v) => [v.voterId, v.points])), [reveal]);
  // Vorher-Reihenfolge rekonstruieren und dann zur neuen animieren.
  const before: ScoreEntry[] = useMemo(() => {
    const prev = view.scores.map((s) => ({ ...s, score: s.score - (gained.get(s.playerId) ?? 0) }));
    return prev.sort((a, b) => b.score - a.score || b.correct - a.correct).map((s, i) => ({ ...s, place: i + 1 }));
  }, [view.scores, gained]);
  const [showNew, setShowNew] = useState(false);
  useEffect(() => {
    const h = window.setTimeout(() => setShowNew(true), 450);
    return () => window.clearTimeout(h);
  }, []);
  const isHost = view.hostId === view.youId;
  const shown = showNew ? view : { ...view, scores: before };
  return (
    <div className="screen scoreboard-screen">
      <RoundHeader view={view} />
      <div className="scoreboard-center">
        <h2 className="screen-title">{t.scoreboard.title}</h2>
        <LayoutGroup>
          <div className="scoreboard-list">
            <MiniStandings view={shown} highlight={showNew ? gained : undefined} />
          </div>
        </LayoutGroup>
        <p className="muted">{view.paused ? t.scoreboard.paused : t.scoreboard.next}</p>
        {isHost && (
          <Button variant="ghost" icon={view.paused ? 'play' : 'pause'} onClick={() => void actions.pause(!view.paused)}>
            {view.paused ? t.scoreboard.resume : t.scoreboard.pause}
          </Button>
        )}
      </div>
    </div>
  );
}
