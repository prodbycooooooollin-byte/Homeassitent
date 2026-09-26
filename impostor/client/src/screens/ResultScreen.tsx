import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, type ClientView, type MatchResult, type PlayerPublic } from '../../../shared/protocol.ts';
import { useCmd, useUI } from '../App.tsx';
import { play } from '../audio/sound.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { CardBack } from '../ui/common.tsx';
import { IconArrowRight } from '../ui/Icons.tsx';
import { SeatSlot, TableSurface, rotateToMe, seatPositions } from '../ui/Table.tsx';

const ABORT_TEXT: Record<string, string> = {
  role_timeout: 'Nicht alle haben ihre Rolle innerhalb von 60 Sekunden bestätigt.',
  player_left: 'hat die Partie verlassen.',
  disconnect_timeout: 'ist nicht rechtzeitig zurückgekehrt.',
  server_restart: 'Der Server wurde neu gestartet.',
};

export function reasonText(r: MatchResult, name: (id: string | null) => string): string {
  switch (r.reason) {
    case 'guess_correct':
      return `${name(r.impostorId)} hat das Wort richtig erraten.`;
    case 'guess_wrong':
      return `${name(r.impostorId)} hat „${r.guess}" geraten – falsch.`;
    case 'impostor_caught':
      return `Die Mehrheit hat ${name(r.impostorId)} überführt.`;
    case 'wrong_accusation':
      return `Die Mehrheit hat ${name(r.accusedId)} beschuldigt – unschuldig.`;
    case 'no_majority':
      return 'Keine absolute Mehrheit in der Schlussabstimmung – der Impostor bleibt unerkannt.';
    default:
      return '';
  }
}

export function ResultScreen({ view, result, onDone }: { view: ClientView; result: MatchResult; onDone: () => void }) {
  const cmd = useCmd();
  const ui = useUI();
  const me = view.me.id;
  // Lobby-Mitglieder, ergänzt um Teilnehmende, die die Lobby inzwischen verlassen haben
  const byId = useMemo(() => {
    const m = new Map<string, PlayerPublic>();
    for (const p of result.players ?? []) {
      m.set(p.id, { id: p.id, name: p.name, avatar: p.avatar, isHost: false, connected: false, ready: false, joinedAt: 0, inMatch: false, score: 0 });
    }
    for (const p of view.lobby.players) m.set(p.id, p);
    return m;
  }, [view.lobby.players, result.players]);
  const name = (id: string | null) => (id ? (byId.get(id)?.name ?? 'Ehemalige Person') : '');
  const aborted = result.outcome === 'aborted';
  // Dramaturgie: 0 Spannung → 1 Rollenflip → 2 Sieger → 3 Details
  const [stage, setStage] = useState(ui.reduced || aborted ? 3 : 0);
  const [collecting, setCollecting] = useState(false);

  useEffect(() => {
    if (aborted) {
      play('error');
      return;
    }
    const won = result.winners.includes(me);
    if (ui.reduced) {
      play(won ? 'win' : 'lose');
      return;
    }
    play('drumroll');
    const t1 = window.setTimeout(() => {
      setStage(1);
      play('reveal');
    }, 1300);
    const t2 = window.setTimeout(() => {
      setStage(2);
      play(won ? 'win' : 'lose');
    }, 1900);
    const t3 = window.setTimeout(() => setStage(3), 2700);
    return () => [t1, t2, t3].forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const order = rotateToMe(result.seatOrder, me);
  const positions = seatPositions(order.length, 41, 37);
  const won = result.winners.includes(me);
  const category = CATEGORIES.find((c) => c.id === result.category);
  const tally = new Map<string, number>();
  for (const v of result.votes ?? []) if (v.targetId) tally.set(v.targetId, (tally.get(v.targetId) ?? 0) + 1);

  const leave = (again: boolean) => {
    play('collect');
    setCollecting(true);
    window.setTimeout(
      () => {
        if (again) void cmd({ t: 'setReady', ready: true });
        onDone();
      },
      ui.reduced ? 0 : 480,
    );
  };

  const winnerTitle = result.winner === 'impostor' ? 'Der Impostor gewinnt' : 'Die Eingeweihten gewinnen';

  return (
    <div className="result">
      <section className="table-area result-table" aria-label="Auflösung">
        <TableSurface mood="reveal">
          {order.map((id, i) => {
            const p: PlayerPublic | undefined = byId.get(id);
            const isImp = id === result.impostorId;
            const flipped = stage >= 1 && !aborted;
            return (
              <SeatSlot key={id} pos={positions[i]}>
                <div className={`result-seat ${flipped ? 'flipped' : ''}`}>
                  <motion.div className="rs-inner" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.5, delay: isImp ? 0 : 0.12 + i * 0.04 }}>
                    <div className="rs-side rs-back paper">
                      <Avatar id={p?.avatar ?? 0} size={52} />
                      <span className="pc-name">{p?.name ?? 'Ehemalige Person'}</span>
                    </div>
                    <div className={`rs-side rs-front paper ${isImp ? 'is-impostor' : 'is-insider'}`}>
                      <Avatar id={p?.avatar ?? 0} size={40} />
                      <span className="pc-name">{p?.name ?? 'Ehemalige Person'}</span>
                      <span className="rs-role">{isImp ? '✕ Impostor' : '◆ Eingeweiht'}</span>
                    </div>
                  </motion.div>
                  {stage >= 1 && !aborted && (tally.get(id) ?? 0) > 0 && (
                    <motion.span className="rs-votes" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      {tally.get(id)} {tally.get(id) === 1 ? 'Stimme' : 'Stimmen'}
                    </motion.span>
                  )}
                  {result.winners.includes(id) && stage >= 2 && (
                    <motion.span className="rs-win" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                      +1
                    </motion.span>
                  )}
                </div>
              </SeatSlot>
            );
          })}

          <div className="table-center">
            <AnimatePresence>
          {stage >= 2 && !aborted && (
            <motion.div
              className={`winner-banner ${result.winner === 'impostor' ? 'imp' : 'ins'}`}
              initial={{ y: -30, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              role="status"
            >
              <span className="wb-title">{winnerTitle}</span>
              <span className="wb-sub">{reasonText(result, name)}</span>
              <span className="wb-winners">
                {result.winner === 'impostor' ? 'Impostor' : 'Eingeweihte'}: {result.winners.map((id) => name(id)).join(', ')}
              </span>
              <span className={`wb-me ${won ? 'won' : 'lost'}`}>{won ? 'Du hast gewonnen!' : 'Diesmal nicht.'}</span>
            </motion.div>
          )}
            </AnimatePresence>
            <AnimatePresence mode="wait">
              {stage === 0 && (
                <motion.div key="suspense" className="suspense" exit={{ opacity: 0, scale: 1.1 }}>
                  <motion.div
                    className="suspense-card"
                    animate={{ rotate: [-3, 3, -3], scale: [1, 1.04, 1] }}
                    transition={{ repeat: Infinity, duration: 0.6 }}
                  >
                    <CardBack />
                  </motion.div>
                  <span className="suspense-text">Auswertung …</span>
                </motion.div>
              )}
              {stage >= 1 && !aborted && (
                <motion.div
                  key="word"
                  className="word-reveal paper"
                  initial={{ rotateY: 90, scale: 0.8 }}
                  animate={{ rotateY: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                >
                  <span className="wr-kicker">Das Wort war</span>
                  <span className="wr-word">{result.word}</span>
                  {category && (
                    <span className="wr-cat">
                      {category.icon} {category.label}
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </TableSurface>

      </section>

      <AnimatePresence>
        {stage >= 3 && (
          <motion.aside className="result-side" initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 26 }}>
            {aborted ? (
              <div className="abort-card paper">
                <h1>Partie ohne Wertung beendet</h1>
                <p>
                  {result.abortPlayerId && result.abortReason !== 'role_timeout' && result.abortReason !== 'server_restart'
                    ? `${name(result.abortPlayerId)} ${ABORT_TEXT[result.abortReason ?? ''] ?? ''}`
                    : ABORT_TEXT[result.abortReason ?? '']}
                </p>
                <p className="muted small">Rollen und Wort bleiben geheim. Es wurden keine Punkte vergeben.</p>
              </div>
            ) : (
              <>
                {result.votes && (
                  <section className="result-section">
                    <h2 className="panel-mini-title">Stimmen</h2>
                    <ul className="vote-list">
                      {result.votes.map((v) => (
                        <li key={v.voterId}>
                          <Avatar id={byId.get(v.voterId)?.avatar ?? 0} size={22} />
                          <span>{name(v.voterId)}</span>
                          <IconArrowRight size={14} />
                          {v.targetId ? (
                            <>
                              <Avatar id={byId.get(v.targetId)?.avatar ?? 0} size={22} />
                              <span className={v.targetId === result.impostorId ? 'hit' : ''}>{name(v.targetId)}</span>
                            </>
                          ) : (
                            <span className="muted">Enthaltung</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <section className="result-section">
                  <h2 className="panel-mini-title">Hinweisfolge</h2>
                  <div className="result-clues">
                    {result.clues.map((c, i) => (
                      <motion.span
                        key={c.id}
                        className={`clue-chip paper ${c.playerId === result.impostorId ? 'by-imp' : ''} ${c.text ? '' : 'empty'}`}
                        animate={collecting ? { x: -200, y: -120, rotate: (i % 5) * 7 - 14, opacity: 0, scale: 0.5 } : { x: 0, y: 0, opacity: 1 }}
                        transition={{ duration: 0.35, delay: collecting ? i * 0.012 : 0 }}
                        title={`${name(c.playerId)} · Durchgang ${c.round}`}
                      >
                        <sup>{c.round}</sup>
                        <Avatar id={byId.get(c.playerId)?.avatar ?? 0} size={18} />
                        {c.text ?? '—'}
                      </motion.span>
                    ))}
                    {result.clues.length === 0 && <span className="muted small">Keine Hinweise gegeben.</span>}
                  </div>
                </section>
              </>
            )}
            {view.lobby.settings.scoreboard && (
              <section className="result-section">
                <h2 className="panel-mini-title">Lobby-Punktestand</h2>
                <ol className="score-list">
                  {[...view.lobby.players]
                    .sort((a, b) => b.score - a.score)
                    .map((p) => (
                      <li key={p.id} className={p.id === me ? 'me' : ''}>
                        <Avatar id={p.avatar} size={22} />
                        <span>{p.name}</span>
                        {!aborted && result.winners.includes(p.id) && <span className="score-delta">+1</span>}
                        <strong>{p.score}</strong>
                      </li>
                    ))}
                </ol>
              </section>
            )}
            <div className="result-actions">
              <button className="btn btn-primary btn-lg" onClick={() => leave(true)} data-autofocus autoFocus>
                Noch eine Partie – ich bin bereit
              </button>
              <button className="btn btn-ghost" onClick={() => leave(false)}>
                Zur Lobby (noch nicht bereit)
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
