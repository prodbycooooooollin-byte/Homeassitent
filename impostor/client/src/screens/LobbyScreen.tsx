import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import {
  CATEGORIES,
  LIMITS,
  ROUND_OPTIONS,
  TURN_SECONDS_OPTIONS,
  type ClientView,
  type LobbySettings,
  type PlayerPublic,
} from '../../../shared/protocol.ts';
import { useCmd, useUI } from '../App.tsx';
import { play } from '../audio/sound.ts';
import { connection, useConnection } from '../net/connection.ts';
import { Dialog, Logo, toast } from '../ui/common.tsx';
import { IconBook, IconCheck, IconCopy, IconDoor, IconGear, IconLink } from '../ui/Icons.tsx';
import { EmptySeat, SeatCard, SeatSlot, TableSurface, rotateToMe, seatPositions } from '../ui/Table.tsx';
import { ChatPanel } from '../match/ChatPanel.tsx';

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} kopiert`, 'success', 2200);
    play('click');
  } catch {
    toast('Kopieren nicht möglich – bitte manuell abschreiben.', 'error');
  }
}

export function turnLabel(s: number): string {
  return s === 0 ? 'ohne' : `${s} s`;
}

function SettingsPanel({ view }: { view: ClientView }) {
  const cmd = useCmd();
  const s = view.lobby.settings;
  const isHost = view.lobby.hostId === view.me.id;
  const disabled = !isHost;
  const update = (patch: Partial<LobbySettings>) => {
    play('click');
    void cmd({ t: 'updateSettings', settings: patch });
  };
  const toggleCat = (id: (typeof CATEGORIES)[number]['id']) => {
    const has = s.categories.includes(id);
    if (has && s.categories.length === 1) {
      toast('Mindestens eine Kategorie muss aktiv bleiben.', 'info');
      return;
    }
    update({ categories: has ? s.categories.filter((c) => c !== id) : [...s.categories, id] });
  };

  return (
    <section className="settings-panel" aria-labelledby="rules-h">
      <div className="panel-head">
        <h2 id="rules-h">Regeln dieser Lobby</h2>
        {!isHost && <span className="muted small">Nur der Host ändert Einstellungen</span>}
      </div>

      <div className="setting">
        <span className="setting-label" id="cat-l">
          Kategorien
        </span>
        <div className="chips-wrap" role="group" aria-labelledby="cat-l">
          {CATEGORIES.map((c) => {
            const on = s.categories.includes(c.id);
            return (
              <button
                key={c.id}
                className={`toggle-chip ${on ? 'on' : ''}`}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggleCat(c.id)}
              >
                <span aria-hidden="true">{c.icon}</span> {c.label}
                {on && <IconCheck size={13} />}
              </button>
            );
          })}
        </div>
        <span className="setting-hint">Die Kategorie der laufenden Partie bleibt geheim.</span>
      </div>

      <div className="setting">
        <span className="setting-label" id="rounds-l">
          Durchgänge
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="rounds-l">
          {ROUND_OPTIONS.map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={s.maxRounds === r}
              className={s.maxRounds === r ? 'on' : ''}
              disabled={disabled}
              onClick={() => update({ maxRounds: r })}
            >
              {r}
            </button>
          ))}
        </div>
        <span className="setting-hint strong">Abstimmung spätestens nach {s.maxRounds} Durchgängen</span>
      </div>

      <div className="setting">
        <span className="setting-label" id="turn-l">
          Zeit pro Zug
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="turn-l">
          {TURN_SECONDS_OPTIONS.map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={s.turnSeconds === t}
              className={s.turnSeconds === t ? 'on' : ''}
              disabled={disabled}
              onClick={() => update({ turnSeconds: t })}
            >
              {turnLabel(t)}
            </button>
          ))}
        </div>
        <span className="setting-hint">Diskussion 45 s · geheime Wahl 30 s</span>
      </div>

      <div className="setting-row">
        <label className="switch">
          <input type="checkbox" checked={s.categoryHint} disabled={disabled} onChange={(e) => update({ categoryHint: e.target.checked })} />
          <span className="switch-ui" aria-hidden="true" />
          <span>Kategorie der Partie für alle anzeigen</span>
        </label>
        <label className="switch">
          <input type="checkbox" checked={s.scoreboard} disabled={disabled} onChange={(e) => update({ scoreboard: e.target.checked })} />
          <span className="switch-ui" aria-hidden="true" />
          <span>Lobby-Punktestand</span>
        </label>
      </div>

      {isHost && (
        <div className="presets">
          <span className="setting-label">Schnellwahl</span>
          <button className="btn btn-small btn-ghost" onClick={() => update({ maxRounds: 3, turnSeconds: 30 })}>
            Kurzspiel · 3 Durchgänge
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => update({ maxRounds: 10, turnSeconds: 30 })}>
            Standard · 10
          </button>
        </div>
      )}
    </section>
  );
}

export function LobbyScreen({ view }: { view: ClientView }) {
  const cmd = useCmd();
  const ui = useUI();
  const conn = useConnection();
  const [kickTarget, setKickTarget] = useState<PlayerPublic | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const { lobby, me } = view;
  const isHost = lobby.hostId === me.id;
  const players = lobby.players;
  const mine = players.find((p) => p.id === me.id);
  const connected = players.filter((p) => p.connected);
  const readyCount = connected.filter((p) => p.ready).length;
  const allReady = connected.length >= LIMITS.minPlayers && readyCount === connected.length;
  const spectating = view.spectating;

  // Sitzordnung: Beitrittsreihenfolge, eigener Platz unten; freie Plätze füllen auf.
  const order = rotateToMe(
    players.map((p) => p.id),
    me.id,
  );
  const seatCount = Math.max(Math.min(LIMITS.maxPlayers, Math.max(players.length + 1, 6)), players.length);
  const positions = seatPositions(seatCount, 40, 37);

  // Sounds für Beitritt & Bereit
  const prev = useRef<{ ids: string[]; ready: Record<string, boolean> } | null>(null);
  useEffect(() => {
    const ids = players.map((p) => p.id);
    const ready = Object.fromEntries(players.map((p) => [p.id, p.ready]));
    const p = prev.current;
    if (p) {
      if (ids.some((id) => !p.ids.includes(id))) play('join');
      else if (players.some((pl) => pl.ready && !p.ready[pl.id] && pl.id !== me.id)) play('ready');
    }
    prev.current = { ids, ready };
  }, [players, me.id]);

  let startHint = '';
  if (connected.length < LIMITS.minPlayers) {
    const missing = LIMITS.minPlayers - connected.length;
    startHint = `Noch ${missing} ${missing === 1 ? 'Person' : 'Personen'} bis zum Start`;
  } else if (!allReady) startHint = `${readyCount} von ${connected.length} bereit`;
  else startHint = 'Alle bereit!';

  const inviteLink = conn.webClient && !window.impostorDesktop ? `${location.origin}${location.pathname}?lobby=${lobby.code}` : null;

  return (
    <div className="lobby">
      <header className="topbar">
        <Logo size="sm" />
        <div className="code-chip" aria-label={`Lobby-Code ${lobby.code.split('').join(' ')}`}>
          <span className="code-label">Code</span>
          <span className="code-value">{lobby.code}</span>
          <button className="icon-btn small" onClick={() => copy(lobby.code, 'Code')} aria-label="Code kopieren" title="Code kopieren">
            <IconCopy size={16} />
          </button>
          {inviteLink && (
            <button className="icon-btn small" onClick={() => copy(inviteLink, 'Einladungslink')} aria-label="Einladungslink kopieren" title="Einladungslink kopieren">
              <IconLink size={16} />
            </button>
          )}
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={ui.openRules} aria-label="Spielregeln (F1)">
            <IconBook />
          </button>
          <button className="icon-btn" onClick={ui.openSettings} aria-label="Einstellungen">
            <IconGear />
          </button>
          <button className="icon-btn" onClick={() => setLeaveOpen(true)} aria-label="Lobby verlassen">
            <IconDoor />
          </button>
        </div>
      </header>

      <div className="lobby-body">
        <section className="table-area" aria-label="Spieltisch">
          <TableSurface mood="calm">
            <AnimatePresence>
              {positions.map((pos, i) => {
                const id = order[i];
                const p = id ? players.find((x) => x.id === id) : undefined;
                return (
                  <SeatSlot key={p ? p.id : `empty-${i}`} pos={pos}>
                    {p ? (
                      <SeatCard
                        player={p}
                        enterFrom={p.id === me.id ? undefined : { x: (50 - pos.x) * 6, y: (50 - pos.y) * 6 }}
                        flags={{
                          isMe: p.id === me.id,
                          ready: lobby.phase === 'lobby' ? p.ready : false,
                          showScore: lobby.settings.scoreboard,
                          caption: p.inMatch ? 'spielt' : undefined,
                        }}
                        onKick={isHost && p.id !== me.id && lobby.phase === 'lobby' ? () => setKickTarget(p) : undefined}
                      />
                    ) : (
                      <EmptySeat />
                    )}
                  </SeatSlot>
                );
              })}
            </AnimatePresence>

            <div className="table-center lobby-center">
              {spectating ? (
                <div className="spectate-note paper">
                  <strong>Partie läuft</strong>
                  <span>Du spielst ab der nächsten Partie mit.</span>
                </div>
              ) : (
                <>
                  <p className="center-kicker">
                    {players.length}/{lobby.maxPlayers} am Tisch · {startHint}
                  </p>
                  <motion.button
                    className={`btn ready-btn ${mine?.ready ? 'is-ready' : ''}`}
                    onClick={() => {
                      const next = !mine?.ready;
                      play(next ? 'ready' : 'unready');
                      void cmd({ t: 'setReady', ready: next });
                    }}
                    whileTap={{ scale: 0.94 }}
                    animate={mine?.ready ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                    transition={{ duration: 0.22 }}
                    aria-pressed={!!mine?.ready}
                  >
                    {mine?.ready ? (
                      <>
                        <IconCheck /> Bereit
                      </>
                    ) : (
                      'Bereit?'
                    )}
                  </motion.button>
                  {isHost ? (
                    <button
                      className="btn btn-primary start-btn"
                      disabled={!allReady}
                      onClick={() => {
                        play('shuffle');
                        void cmd({ t: 'startMatch' });
                      }}
                    >
                      Spiel starten
                    </button>
                  ) : (
                    <p className="muted small">Der Host startet, sobald alle bereit sind.</p>
                  )}
                  <p className="taboo-note">
                    Tabu als Hinweis: das geheime Wort, seine Formen (z. B. Mehrzahl) und Buchstabieren.
                  </p>
                </>
              )}
            </div>
          </TableSurface>
        </section>

        <aside className="lobby-side">
          <SettingsPanel view={view} />
          <ChatPanel view={view} title="Lobby-Chat" compact />
        </aside>
      </div>

      <Dialog open={!!kickTarget} onClose={() => setKickTarget(null)} title="Person entfernen?" tone="danger">
        <p>
          <strong>{kickTarget?.name}</strong> wird aus der Lobby entfernt und kann dieser Lobby nicht erneut beitreten.
        </p>
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={() => setKickTarget(null)} data-autofocus>
            Abbrechen
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (kickTarget) void cmd({ t: 'kick', playerId: kickTarget.id });
              setKickTarget(null);
            }}
          >
            Entfernen
          </button>
        </div>
      </Dialog>

      <Dialog open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Lobby verlassen?">
        <p>Du kannst mit dem Code {lobby.code} jederzeit wieder beitreten, solange die Lobby besteht.</p>
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={() => setLeaveOpen(false)} data-autofocus>
            Bleiben
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              setLeaveOpen(false);
              void connection.send({ t: 'leaveLobby' });
            }}
          >
            Verlassen
          </button>
        </div>
      </Dialog>
    </div>
  );
}
