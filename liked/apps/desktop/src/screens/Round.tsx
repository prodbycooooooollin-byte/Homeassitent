import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { RoomView } from '@liked/protocol';
import { t } from '../i18n/de';
import { actions, castVote } from '../lib/net';
import { sound } from '../lib/sound';
import { useStore } from '../state/store';
import { Avatar, DemoBadge, Icon, TimerRing, useServerNow } from '../components/ui';
import { TikTokEmbed } from '../player/TikTokEmbed';
import { DemoClip } from '../player/DemoClip';
import type { ClipPlayerProps } from '../player/types';

const LOAD_TIMEOUT_MS = 10_000;

/** Video + Wiedergabemeldungen. Genau ein aktiver Player; wird mit der Runde freigegeben. */
function ClipStage({ view }: { view: RoomView }) {
  const round = view.round!;
  const offset = useStore((s) => s.clockOffset);
  const startMuted = useStore((s) => s.settings?.audio.videoStartMuted ?? false);
  const loadKey = `${round.roundId}:${round.loadAttempt}`;
  const reported = useRef<string>('');

  // Clientseitiges Lade-Timeout: meldet Fehler, der Server entscheidet über Retry/Ersatz.
  useEffect(() => {
    if (view.phase !== 'PREPARING') return;
    const h = window.setTimeout(() => {
      if (reported.current !== loadKey) {
        reported.current = loadKey;
        void actions.playerStatus(round.roundId, 'failed', 'timeout');
      }
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(h);
  }, [loadKey, view.phase, round.roundId]);

  const scheduled = view.phase !== 'PREPARING' && round.startAt > 0;
  const props: ClipPlayerProps = {
    clip: round.clip,
    loadKey,
    startAtLocal: scheduled ? round.startAt - offset : null,
    stopAtLocal: scheduled ? round.deadline - offset : null,
    startMuted,
    onReady: () => {
      if (reported.current === loadKey) return;
      reported.current = loadKey;
      void actions.playerStatus(round.roundId, 'ready');
    },
    onLoadFailed: (reason) => {
      if (reported.current === loadKey) return;
      reported.current = loadKey;
      void actions.playerStatus(round.roundId, 'failed', reason);
    },
    onPlayback: (kind, pos) => void actions.playback(round.roundId, kind, pos)
  };

  return (
    <div className="clip-frame">
      {round.clip.source === 'tiktok' ? <TikTokEmbed key={loadKey} {...props} /> : <DemoClip key={loadKey} {...props} />}
      <AnimatePresence>
        {view.phase === 'PREPARING' && (
          <motion.div className="clip-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="spinner" />
            <p>{round.loadAttempt > 1 ? t.round.retrying : t.round.preparing}</p>
          </motion.div>
        )}
      </AnimatePresence>
      {view.phase === 'COUNTDOWN' && <Countdown roundId={round.roundId} startAt={round.startAt} />}
    </div>
  );
}

function Countdown({ roundId, startAt }: { roundId: string; startAt: number }) {
  const now = useServerNow(50);
  const left = Math.max(0, startAt - now);
  const n = Math.ceil(left / 1000);
  useEffect(() => {
    if (n >= 1 && n <= 3) sound.once(`cd:${roundId}:${n}`, () => sound.countdown(n));
    if (n === 0) sound.once(`cd:${roundId}:0`, () => sound.countdown(0));
  }, [n, roundId]);
  return (
    <div className="clip-overlay countdown" aria-live="assertive">
      <p className="muted">{t.round.getReady}</p>
      <AnimatePresence mode="popLayout">
        <motion.span key={n} className="countdown-num" initial={{ scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.25 }}>
          {n > 0 ? n : 'LOS'}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function AnswerCards({ view }: { view: RoomView }) {
  const round = view.round!;
  const vote = useStore((s) => s.vote);
  const myVote = vote && vote.roundId === round.roundId ? vote : null;
  const canVote = view.phase === 'PLAYING_AND_VOTING' && !myVote && !round.you.vote;
  const byId = new Map(view.players.map((p) => [p.id, p]));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = Number(e.key);
      if (!Number.isInteger(k) || k < 1 || k > round.answerOptions.length || e.repeat) return;
      if (!canVote) return;
      void castVote(round.answerOptions[k - 1]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canVote, round.answerOptions]);

  return (
    <div className={`answer-grid n${round.answerOptions.length}`} role="group" aria-label={t.round.question}>
      {round.answerOptions.map((id, i) => {
        const p = byId.get(id);
        const chosen = myVote?.targetId === id;
        const state = chosen ? (myVote!.status === 'confirmed' ? 'confirmed' : myVote!.status === 'late' ? 'late' : 'sent') : myVote ? 'dimmed' : 'idle';
        return (
          <motion.button
            key={id}
            className={`answer-card state-${state}`}
            disabled={!canVote && !chosen}
            aria-pressed={chosen}
            onMouseEnter={() => canVote && sound.hover()}
            onClick={() => canVote && void castVote(id)}
            whileTap={canVote ? { scale: 0.96 } : undefined}
          >
            <span className="answer-key" aria-hidden="true">{i + 1}</span>
            <Avatar avatar={p?.avatar ?? 'ghost'} size={58} ring={chosen ? (state === 'confirmed' ? 'cyan' : 'violet') : undefined} />
            <span className="answer-name">{p?.name ?? '?'}</span>
            {chosen && (
              <span className="answer-state">
                <Icon name={state === 'confirmed' ? 'check' : state === 'late' ? 'x' : 'sparkle'} size={16} />
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

function VoteStatus({ view }: { view: RoomView }) {
  const round = view.round!;
  const vote = useStore((s) => s.vote);
  const v = vote && vote.roundId === round.roundId ? vote : null;
  let text = '';
  if (v?.status === 'sending') text = t.round.sent;
  if (v?.status === 'retrying') text = t.round.notConfirmed;
  if (v?.status === 'confirmed') text = t.round.confirmed;
  if (v?.status === 'late') text = t.round.tooLate;
  return (
    <div className={`vote-status status-${v?.status ?? 'none'}`} aria-live="polite">
      {text && (
        <>
          <Icon name={v?.status === 'confirmed' ? 'check' : v?.status === 'late' ? 'x' : 'sparkle'} size={16} /> {text}
        </>
      )}
      <span className="muted votes-in">{t.round.votesIn(round.votesIn, round.votersTotal)}</span>
    </div>
  );
}

export function MiniStandings({ view, highlight }: { view: RoomView; highlight?: Map<string, number> }) {
  const byId = new Map(view.players.map((p) => [p.id, p]));
  return (
    <ol className="mini-standings">
      {view.scores.map((s) => {
        const p = byId.get(s.playerId);
        return (
          <motion.li key={s.playerId} layout transition={{ type: 'spring', stiffness: 300, damping: 30 }} className={s.playerId === view.youId ? 'me' : ''}>
            <span className="place">{s.place}</span>
            <Avatar avatar={p?.avatar ?? 'ghost'} size={30} />
            <span className="nm">{p?.name ?? '?'}</span>
            {s.streak >= 2 && <span className="streak-chip">🔥{s.streak}</span>}
            <span className="pts">{s.score.toLocaleString('de-DE')}</span>
            {highlight?.get(s.playerId) ? <span className="pts-plus">+{highlight.get(s.playerId)}</span> : null}
          </motion.li>
        );
      })}
    </ol>
  );
}

export function RoundHeader({ view }: { view: RoomView }) {
  return (
    <div className="round-header">
      <span className="round-count">{t.round.round(Math.max(1, view.roundNumber), view.totalRounds)}</span>
      <div className="block-dots" aria-hidden="true">
        {Array.from({ length: view.totalBlocks }, (_, i) => (
          <span key={i} className={i < view.blockIndex ? 'done' : i === view.blockIndex ? 'current' : ''} />
        ))}
      </div>
      {view.mode === 'demo' && <DemoBadge text={t.common.demo} />}
    </div>
  );
}

export function RoundScreen({ view }: { view: RoomView }) {
  const round = view.round!;
  const isOwner = round.you.role === 'owner';
  return (
    <div className="screen round-screen">
      <RoundHeader view={view} />
      <div className="round-layout">
        <aside className="round-left">
          <MiniStandings view={view} />
        </aside>
        <main className="round-center">
          <ClipStage view={view} />
          {round.clip.source === 'tiktok' && <p className="hint center">{t.round.unmuteHint}</p>}
        </main>
        <aside className="round-right">
          <div className="question-row">
            <h2 className="question">{t.round.question}</h2>
            {view.phase === 'PLAYING_AND_VOTING' && <TimerRing endsAt={round.deadline} totalMs={round.answerSeconds * 1000} />}
          </div>
          {isOwner ? (
            <motion.div className="owner-panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Icon name="eye" size={40} />
              <p>{t.round.yourClip}</p>
            </motion.div>
          ) : (
            <>
              <AnswerCards view={view} />
              <VoteStatus view={view} />
              <p className="hint">{t.round.keyHint}</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
