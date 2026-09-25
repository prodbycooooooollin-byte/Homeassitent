import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LIMITS, type ClientView, type PlayerPublic } from '../../../shared/protocol.ts';
import { useCmd, useUI } from '../App.tsx';
import { play } from '../audio/sound.ts';
import { connection } from '../net/connection.ts';
import { settingsStore, useSettings } from '../state/storage.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { CardBack, Dialog, TimerRing, remainingMs, useServerNow } from '../ui/common.tsx';
import {
  IconBook,
  IconDoor,
  IconEye,
  IconGear,
  IconHand,
  IconMute,
  IconPause,
  IconSend,
  IconSound,
  IconUndo,
  IconVote,
} from '../ui/Icons.tsx';
import { SeatCard, SeatSlot, TableSurface, rotateToMe, seatPositions, type SeatPos } from '../ui/Table.tsx';
import { ChatPanel } from './ChatPanel.tsx';
import { GuessDialog } from './GuessDialog.tsx';
import { History } from './History.tsx';
import { FlipCard } from './RoleCard.tsx';

const PHASE_LABEL: Record<string, string> = {
  roleReveal: 'Rollen ansehen',
  clues: 'Hinweise',
  discussion: 'Diskussion',
  voting: 'Geheime Wahl',
  resolution: 'Auflösung',
  aborted: 'Abbruch',
};

function useTableSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

export function MatchScreen({ view }: { view: ClientView }) {
  const match = view.match!;
  const priv = view.private!;
  const me = view.me.id;
  const cmd = useCmd();
  const ui = useUI();
  const settings = useSettings();
  const now = useServerNow(200);
  const { ref: tableRef, size } = useTableSize();

  const players = view.lobby.players;
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const nameOf = (id: string | null) => (id ? (byId.get(id)?.name ?? '?') : '');
  const order = rotateToMe(match.seatOrder, me);
  const positions = seatPositions(order.length, 41, 37);
  const posOf = (id: string): SeatPos => positions[order.indexOf(id)] ?? { x: 50, y: 50, angle: 0 };

  const phase = match.phase;
  const paused = match.paused !== null;
  const remaining = paused ? match.pausedRemainingMs : remainingMs(match.deadline, now);
  const myTurn = phase === 'clues' && match.activePlayerId === me;
  const mood = phase === 'voting' ? 'voting' : phase === 'discussion' ? 'discussion' : 'calm';

  // ---------------------------------------------------------------------------
  // Austeilen: nur wenn der Beginn live miterlebt wird (Spätverbinder sehen sofort den Zustand).
  const [dealing, setDealing] = useState(
    () => phase === 'roleReveal' && !ui.reduced && match.deadline !== null && match.deadline - connection.serverNow() > 57_000,
  );
  useEffect(() => {
    if (!dealing) return;
    play('shuffle');
    const t1 = window.setTimeout(() => play('deal'), 750);
    const t2 = window.setTimeout(() => setDealing(false), 750 + order.length * 70 + 450);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rollenansicht
  const acked = match.acknowledged.includes(me);
  const [revealFlipped, setRevealFlipped] = useState(false);
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<number | null>(null);
  const showPeek = (on: boolean) => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setPeek(on);
    if (on) {
      play('flip');
      peekTimer.current = window.setTimeout(() => setPeek(false), settings.privacyMode ? 2500 : 5000);
    }
  };

  // ---------------------------------------------------------------------------
  // Klang- und Fokusreaktionen auf Zustandsänderungen
  const prev = useRef({ clues: match.clues.length, active: match.activePlayerId, phase, voted: match.voted.length, supporters: match.proposal?.supporters.length ?? 0, early: match.lastEarlyVote });
  const [earlyNote, setEarlyNote] = useState<string | null>(null);
  useEffect(() => {
    const p = prev.current;
    if (match.clues.length > p.clues) play('clue');
    if (phase !== p.phase) {
      if (phase === 'discussion' || phase === 'voting') play('phase');
      if (phase === 'clues' && p.phase === 'roleReveal') play('turn');
    }
    if (phase === 'clues' && match.activePlayerId !== p.active && match.activePlayerId) {
      play(match.activePlayerId === me ? 'myTurn' : 'turn');
    }
    if (match.voted.length > p.voted) play('vote');
    const sup = match.proposal?.supporters.length ?? 0;
    if (sup > p.supporters) play('propose');
    if (match.lastEarlyVote && match.lastEarlyVote !== p.early && JSON.stringify(match.lastEarlyVote) !== JSON.stringify(p.early)) {
      const ev = match.lastEarlyVote;
      const parts = ev.counts.map((c) => `${nameOf(c.playerId)} ${c.votes}`).join(' · ');
      setEarlyNote(`Keine Mehrheit – es geht weiter. ${parts || 'Keine Stimmen'}${ev.abstentions ? ` · ${ev.abstentions} Enthaltung${ev.abstentions > 1 ? 'en' : ''}` : ''}`);
      window.setTimeout(() => setEarlyNote(null), 7000);
    }
    prev.current = { clues: match.clues.length, active: match.activePlayerId, phase, voted: match.voted.length, supporters: sup, early: match.lastEarlyVote };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  // Tick in den letzten Sekunden (eigener Zug / Wahl)
  const secs = remaining === null ? null : Math.ceil(remaining / 1000);
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (paused || secs === null || secs > 5 || secs <= 0) return;
    if (lastTick.current === secs) return;
    lastTick.current = secs;
    if (myTurn || phase === 'voting') play('tickUrgent');
    else if (phase === 'discussion') play('tick');
  }, [secs, myTurn, phase, paused]);

  // ---------------------------------------------------------------------------
  // Hinweis-Eingabe
  const [clue, setClue] = useState('');
  const [sending, setSending] = useState(false);
  const clueRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (myTurn && !paused) clueRef.current?.focus();
  }, [myTurn, paused]);
  const submitClue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || !clue.trim()) return;
    setSending(true);
    const r = await cmd({ t: 'submitClue', text: clue });
    setSending(false);
    if (r.ok) setClue('');
  };

  // Wahl
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (phase !== 'voting') setSelected(null);
  }, [phase]);
  const myVote = priv.myVote;
  const canVote = phase === 'voting' && !myVote && !paused;

  // Vorschlag
  const proposal = match.proposal;
  const iSupport = !!proposal?.supporters.includes(me);
  const iProposed = match.proposedThisRound.includes(me);
  const canPropose = phase === 'clues' && !paused && !match.proposalsLocked && (proposal ? !iSupport : !iProposed);

  // Raten & Verlassen
  const [guessOpen, setGuessOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  useEffect(() => {
    if (!priv.canGuess) setGuessOpen(false);
  }, [priv.canGuess]);

  const latestClue = match.clues[match.clues.length - 1] ?? null;
  const activeName = nameOf(match.activePlayerId);

  // Statuszeile: Was soll ich gerade tun?
  let instruction = '';
  if (paused) instruction = `Pausiert – warte auf ${match.paused!.playerIds.map(nameOf).join(', ')}`;
  else if (phase === 'roleReveal') instruction = acked ? `Warte auf die anderen (${match.acknowledged.length}/${match.seatOrder.length})` : 'Dreh deine Karte um';
  else if (phase === 'clues') instruction = myTurn ? 'Du bist dran – schreib deinen Hinweis' : `${activeName} ist dran`;
  else if (phase === 'discussion') instruction = match.voteKind === 'final' ? 'Letzte Diskussion vor der Schlussabstimmung' : 'Diskutiert – wer blufft?';
  else if (phase === 'voting') instruction = myVote ? 'Stimme abgegeben – warte auf die anderen' : 'Wähle am Tisch, wer der Impostor ist';

  const timerTotal = match.deadlineTotalMs;

  return (
    <div className={`match phase-${phase} ${paused ? 'is-paused' : ''}`}>
      <header className="topbar match-top">
        <div className="phase-pill" aria-live="polite">
          <span className={`phase-dot phase-${phase}`} aria-hidden="true" />
          <span className="phase-name">{PHASE_LABEL[phase]}</span>
          {match.voteKind === 'final' && (phase === 'discussion' || phase === 'voting') && <span className="chip chip-coral">Schlussabstimmung</span>}
        </div>
        <div className="round-counter" aria-label={`Durchgang ${match.round} von ${match.maxRounds}`}>
          <span className="rc-label">Durchgang</span>
          <span className="rc-num">
            {match.round}
            <small>/{match.maxRounds}</small>
          </span>
        </div>
        <TimerRing
          remaining={remaining}
          total={timerTotal}
          paused={paused}
          size={46}
          label={
            paused
              ? 'Timer pausiert'
              : remaining === null
                ? 'Kein Zugtimer'
                : `${Math.ceil(remaining / 1000)} Sekunden ${phase === 'clues' ? 'für diesen Zug' : 'in dieser Phase'}`
          }
        />
        {match.categoryHint && <span className="chip chip-cat">Kategorie: {match.categoryHint}</span>}
        <div className="top-actions">
          <button className="icon-btn" onClick={ui.openRules} aria-label="Spielregeln (F1)">
            <IconBook />
          </button>
          <button
            className="icon-btn"
            onClick={() => settingsStore.set({ muted: !settings.muted })}
            aria-label={settings.muted ? 'Ton einschalten' : 'Ton ausschalten'}
            aria-pressed={settings.muted}
          >
            {settings.muted ? <IconMute /> : <IconSound />}
          </button>
          <button className="icon-btn" onClick={ui.openSettings} aria-label="Einstellungen">
            <IconGear />
          </button>
          <button className="icon-btn" onClick={() => setLeaveOpen(true)} aria-label="Partie verlassen">
            <IconDoor />
          </button>
        </div>
      </header>

      <div className="match-body">
        <section className="table-area" aria-label="Spieltisch" ref={tableRef}>
          <TableSurface mood={mood}>
            {order.map((id, i) => {
              const p: PlayerPublic =
                byId.get(id) ?? { id, name: 'Ehemalige Person', avatar: 0, isHost: false, connected: false, ready: false, joinedAt: 0, inMatch: true, score: 0 };
              const pos = positions[i];
              const selectable = canVote && id !== me;
              return (
                <SeatSlot key={id} pos={pos}>
                  <motion.div
                    initial={dealing ? { x: ((50 - pos.x) / 100) * size.w, y: ((50 - pos.y) / 100) * size.h, scale: 0.4, opacity: 0, rotate: 12 } : false}
                    animate={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }}
                    transition={{ delay: dealing ? 0.75 + i * 0.07 : 0, type: 'spring', stiffness: 240, damping: 24 }}
                  >
                    <SeatCard
                      player={p}
                      flags={{
                        isMe: id === me,
                        active: phase === 'clues' && match.activePlayerId === id && !paused,
                        acked: phase === 'roleReveal' && match.acknowledged.includes(id),
                        voted: phase === 'voting' && match.voted.includes(id),
                        supporter: phase === 'clues' && !!proposal?.supporters.includes(id),
                        selectable,
                        selected: phase === 'voting' && (selected === id || myVote === id),
                        caption: phase === 'discussion' && match.readyToVote.includes(id) ? 'bereit zur Wahl' : undefined,
                        showScore: false,
                      }}
                      onSelect={
                        selectable
                          ? () => {
                              play('click');
                              setSelected(id === selected ? null : id);
                            }
                          : undefined
                      }
                    />
                    {phase === 'clues' && match.activePlayerId === id && remaining !== null && !paused && match.deadlineTotalMs && (
                      <div className="seat-timer" aria-hidden="true">
                        <div className="seat-timer-fill" style={{ transform: `scaleX(${remaining / match.deadlineTotalMs})` }} />
                      </div>
                    )}
                  </motion.div>
                </SeatSlot>
              );
            })}

            {/* Mitte des Tisches */}
            <div className="table-center">
              <AnimatePresence mode="popLayout">
                {dealing && (
                  <motion.div key="deck" className="deck" exit={{ opacity: 0, scale: 0.8 }}>
                    {[0, 1, 2, 3, 4].map((k) => (
                      <motion.div
                        key={k}
                        className="deck-card"
                        initial={{ x: 0, rotate: 0 }}
                        animate={{ x: [0, k % 2 ? 70 : -70, 0], rotate: [0, k % 2 ? 12 : -12, (k - 2) * 2], y: -k * 2 }}
                        transition={{ duration: 0.6, delay: k * 0.03, ease: 'easeInOut' }}
                      >
                        <CardBack small />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {!dealing && phase === 'clues' && (
                <div className="center-clue-wrap">
                  <AnimatePresence mode="popLayout">
                    {latestClue ? (
                      <motion.div
                        key={latestClue.id}
                        className={`center-clue paper ${latestClue.text ? '' : 'empty'}`}
                        initial={{
                          x: ((posOf(latestClue.playerId).x - 50) / 100) * size.w,
                          y: ((posOf(latestClue.playerId).y - 50) / 100) * size.h,
                          scale: 0.35,
                          rotate: -14,
                          opacity: 0.6,
                        }}
                        animate={{ x: 0, y: 0, scale: 1, rotate: -1.5, opacity: 1 }}
                        exit={{ x: size.w * 0.3, y: -40, scale: 0.4, rotate: 10, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                      >
                        <span className="cc-meta">
                          <Avatar id={byId.get(latestClue.playerId)?.avatar ?? 0} size={26} />
                          {nameOf(latestClue.playerId)} · Durchgang {latestClue.round}
                        </span>
                        <span className="cc-text">{latestClue.text ?? 'Kein Hinweis abgegeben'}</span>
                      </motion.div>
                    ) : (
                      <motion.div key="first" className="center-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        Durchgang 1 beginnt – {myTurn ? 'du fängst an' : `${activeName} fängt an`}.
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {!dealing && phase === 'discussion' && (
                <motion.div className="center-banner" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <span className="cb-kicker">{match.voteKind === 'final' ? 'Alle Durchgänge gespielt' : 'Abstimmung ausgelöst'}</span>
                  <span className="cb-title">Wer blufft?</span>
                  <span className="cb-sub">Die geheime Wahl beginnt nach der Diskussion.</span>
                </motion.div>
              )}

              {!dealing && phase === 'voting' && (
                <motion.div className="center-banner voting" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <span className="cb-kicker">Geheime Wahl</span>
                  <span className="cb-title">
                    {match.voted.length}/{match.seatOrder.length} abgestimmt
                  </span>
                  <span className="cb-sub">Überführt ist, wer mindestens {match.votesNeeded} Stimmen erhält.</span>
                </motion.div>
              )}

              {!dealing && phase === 'roleReveal' && acked && (
                <div className="center-hint">
                  {match.acknowledged.length}/{match.seatOrder.length} haben ihre Rolle gesehen
                </div>
              )}

              <AnimatePresence>
                {earlyNote && (
                  <motion.div className="early-note paper" role="status" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
                    {earlyNote}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Rollenansicht */}
            <AnimatePresence>
              {!dealing && phase === 'roleReveal' && !acked && (
                <motion.div
                  className="reveal-stage"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.25 } }}
                >
                  <motion.div initial={{ y: 200, scale: 0.6 }} animate={{ y: 0, scale: 1 }} exit={{ y: 260, scale: 0.4 }} transition={{ type: 'spring', stiffness: 220, damping: 24 }}>
                    <FlipCard
                      className="reveal-card"
                      flipped={revealFlipped}
                      priv={priv}
                      categoryHint={match.categoryHint}
                      label={revealFlipped ? 'Deine Rollenkarte' : 'Deine verdeckte Rollenkarte – zum Umdrehen klicken'}
                      onClick={
                        revealFlipped
                          ? undefined
                          : () => {
                              play('flip');
                              setRevealFlipped(true);
                            }
                      }
                    />
                  </motion.div>
                  <div className="reveal-actions">
                    {revealFlipped ? (
                      <button
                        className="btn btn-primary btn-lg"
                        data-autofocus
                        autoFocus
                        onClick={() => {
                          play('flip');
                          setRevealFlipped(false);
                          window.setTimeout(() => void cmd({ t: 'ackRole' }), 260);
                        }}
                      >
                        Verstanden
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-lg"
                        autoFocus
                        onClick={() => {
                          play('flip');
                          setRevealFlipped(true);
                        }}
                      >
                        Karte umdrehen
                      </button>
                    )}
                    <p className="muted small">Nur du siehst deine Karte. Alle Karten sehen von außen gleich aus.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pause */}
            <AnimatePresence>
              {paused && (
                <motion.div className="pause-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="alert">
                  <div className="paper pause-card">
                    <IconPause size={28} />
                    <strong>Partie pausiert</strong>
                    <span>
                      Verbindung zu {match.paused!.playerIds.map(nameOf).join(', ')} unterbrochen. Warte auf Rückkehr …
                    </span>
                    <span className="pause-count">
                      Abbruch ohne Wertung in {Math.max(0, Math.ceil((match.paused!.abortAt - now) / 1000))} s
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </TableSurface>
        </section>

        <aside className="match-side">
          <History
            clues={match.clues}
            seatOrder={match.seatOrder}
            players={players}
            currentRound={match.round}
            maxRounds={match.maxRounds}
          />
          {phase === 'discussion' || phase === 'voting' ? (
            <ChatPanel view={view} title="Diskussion" />
          ) : (
            <ChatPanel view={view} title="Diskussion" disabledReason="Chat öffnet in der Diskussion" compact />
          )}
        </aside>
      </div>

      {/* Dock unten: eigene Karte, Eingabe, feste Aktionen */}
      <footer className="dock">
        <div className="dock-role">
          <FlipCard
            className="mini-role"
            flipped={peek && phase !== 'roleReveal'}
            priv={priv}
            categoryHint={match.categoryHint}
            label={peek ? 'Deine Rollenkarte (aufgedeckt)' : 'Deine Rollenkarte (verdeckt)'}
          />
          <button
            className="btn btn-small btn-ghost peek-btn"
            disabled={phase === 'roleReveal'}
            aria-pressed={peek}
            onClick={settings.privacyMode ? undefined : () => showPeek(!peek)}
            onPointerDown={settings.privacyMode ? () => showPeek(true) : undefined}
            onPointerUp={settings.privacyMode ? () => showPeek(false) : undefined}
            onPointerLeave={settings.privacyMode ? () => peek && showPeek(false) : undefined}
            onKeyDown={settings.privacyMode ? (e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && showPeek(true) : undefined}
            onKeyUp={settings.privacyMode ? (e) => (e.key === ' ' || e.key === 'Enter') && showPeek(false) : undefined}
          >
            <IconEye size={16} /> {settings.privacyMode ? 'Halten zum Ansehen' : peek ? 'Verdecken' : 'Karte ansehen'}
          </button>
        </div>

        <div className="dock-main">
          <p className={`instruction ${myTurn ? 'mine' : ''}`} aria-live="polite">
            {instruction}
          </p>
          {phase === 'clues' && (
            <form className={`clue-form ${myTurn ? 'active' : ''}`} onSubmit={submitClue}>
              <input
                ref={clueRef}
                className="text-input clue-input"
                value={clue}
                onChange={(e) => setClue(e.target.value)}
                maxLength={LIMITS.clueMax}
                disabled={!myTurn || paused}
                placeholder={myTurn ? 'Dein Hinweis – Wort oder kurzer Begriff' : `${activeName} schreibt …`}
                aria-label="Dein Hinweis"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="char-count" aria-hidden="true">
                {clue.length}/{LIMITS.clueMax}
              </span>
              <button className="btn btn-primary" type="submit" disabled={!myTurn || paused || sending || !clue.trim()}>
                <IconSend size={18} /> Ablegen
              </button>
            </form>
          )}
          {phase === 'discussion' && (
            <div className="dock-row">
              <button
                className="btn btn-primary"
                disabled={match.readyToVote.includes(me) || paused}
                onClick={() => {
                  play('ready');
                  void cmd({ t: 'readyToVote' });
                }}
              >
                <IconVote size={18} /> {match.readyToVote.includes(me) ? 'Bereit zur Wahl ✓' : 'Bereit zur Wahl'}
              </button>
              <span className="muted small">
                {match.readyToVote.length}/{match.seatOrder.length} bereit · sonst startet die Wahl automatisch
              </span>
            </div>
          )}
          {phase === 'voting' && (
            <div className="dock-row">
              {myVote ? (
                <span className="vote-done">
                  <span className="vote-card-mini" aria-hidden="true" /> Deine Stimme ist verdeckt abgelegt – geheim bis zur Auswertung.
                </span>
              ) : selected ? (
                <>
                  <button
                    className="btn btn-coral"
                    disabled={!canVote}
                    onClick={async () => {
                      const r = await cmd({ t: 'castVote', targetId: selected });
                      if (r.ok) play('vote');
                    }}
                  >
                    <IconVote size={18} /> Stimme für {nameOf(selected)} abgeben
                  </button>
                  <button className="btn btn-ghost" onClick={() => setSelected(null)}>
                    Auswahl aufheben
                  </button>
                </>
              ) : (
                <span className="muted">Klicke auf eine Karte am Tisch. Keine Stimme bis zum Ablauf zählt als Enthaltung.</span>
              )}
            </div>
          )}
        </div>

        <div className="dock-actions">
          {phase === 'clues' && (
            <div className="propose">
              {proposal && (
                <span className="propose-status" aria-live="polite">
                  <IconHand size={15} /> {proposal.supporters.length}/{proposal.needed} für Abstimmung
                </span>
              )}
              {iSupport ? (
                <button className="btn btn-ghost" onClick={() => void cmd({ t: 'withdrawSupport' })}>
                  <IconUndo size={16} /> Zurücknehmen
                </button>
              ) : (
                <button
                  className="btn btn-outline-coral"
                  disabled={!canPropose}
                  title={match.proposalsLocked ? 'In diesem Durchgang gab es bereits eine Abstimmung' : undefined}
                  onClick={() => void cmd({ t: 'proposeVote' })}
                >
                  <IconHand size={16} /> {proposal ? 'Unterstützen' : 'Abstimmung vorschlagen'}
                </button>
              )}
            </div>
          )}
          {priv.role === 'impostor' && (phase === 'clues' || phase === 'discussion') && (
            <button className="btn btn-guess" disabled={!priv.canGuess} onClick={() => setGuessOpen(true)}>
              Ich kenne das Wort
            </button>
          )}
        </div>
      </footer>

      <GuessDialog open={guessOpen && priv.canGuess} onClose={() => setGuessOpen(false)} />

      <Dialog open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Partie verlassen?" tone="danger">
        <p>
          Wenn du jetzt gehst, endet die Partie <strong>für alle ohne Wertung</strong>. Die Lobby bleibt bestehen.
        </p>
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={() => setLeaveOpen(false)} data-autofocus>
            Weiterspielen
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              setLeaveOpen(false);
              void connection.send({ t: 'leaveLobby' });
            }}
          >
            Partie verlassen
          </button>
        </div>
      </Dialog>
    </div>
  );
}
