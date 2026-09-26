import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import {
  CATEGORIES,
  LIMITS,
  PRESETS,
  ROUND_OPTIONS,
  TURN_SECONDS_OPTIONS,
  type ClientView,
  type LobbySettings,
  type PlayerPublic,
} from '../../../shared/protocol.ts';
import { estimateDuration } from '../../../shared/duration.ts';
import { useCmd, useUI } from '../App.tsx';
import { play } from '../audio/sound.ts';
import { connection } from '../net/connection.ts';
import { hostPrefs } from '../state/storage.ts';
import { Dialog, Logo, toast, useMediaQuery } from '../ui/common.tsx';
import { IconBook, IconCheck, IconClock, IconDoor, IconGear, IconLink, IconUsers, IconX } from '../ui/Icons.tsx';
import { CopyButton, InviteDialog } from '../ui/Invite.tsx';
import { EmptySeat, SeatCard, SeatSlot, TableSurface, rotateToMe, seatPositions } from '../ui/Table.tsx';
import { ChatPanel } from '../match/ChatPanel.tsx';

export function turnLabel(s: number): string {
  return s === 0 ? 'ohne Limit' : `${s} s`;
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
}

function RulesSummary({ s, players }: { s: LobbySettings; players: number }) {
  const est = estimateDuration(Math.max(players, LIMITS.minPlayers), s.maxRounds, s.turnSeconds);
  const allCats = s.categories.length === CATEGORIES.length;
  return (
    <ul className="rules-summary">
      <li>
        <strong>{s.maxRounds}</strong> Durchgänge
      </li>
      <li>
        <strong>{turnLabel(s.turnSeconds)}</strong> pro Zug
      </li>
      <li>{allCats ? 'Alle Kategorien' : `${s.categories.length} von ${CATEGORIES.length} Kategorien`}</li>
      <li className="est">
        <IconClock size={15} /> Dauer: {est.label}
        {est.minMinutes !== null && <span className="muted"> (Schätzung bei {Math.max(players, LIMITS.minPlayers)} Personen)</span>}
      </li>
    </ul>
  );
}

function SettingsPanel({ view }: { view: ClientView }) {
  const cmd = useCmd();
  const s = view.lobby.settings;
  const isHost = view.lobby.hostId === view.me.id;
  const hostName = view.lobby.players.find((p) => p.id === view.lobby.hostId)?.name ?? 'der Host';
  const disabled = !isHost;
  const update = async (patch: Partial<LobbySettings>) => {
    play('click');
    const r = await cmd({ t: 'updateSettings', settings: patch });
    if (r.ok) hostPrefs.set({ ...s, ...patch });
  };
  const toggleCat = (id: (typeof CATEGORIES)[number]['id']) => {
    const has = s.categories.includes(id);
    if (has && s.categories.length === 1) {
      toast('Mindestens eine Kategorie muss aktiv bleiben.', 'info');
      return;
    }
    void update({ categories: has ? s.categories.filter((c) => c !== id) : [...s.categories, id] });
  };
  const activePreset = PRESETS.find((p) => p.maxRounds === s.maxRounds && p.turnSeconds === s.turnSeconds);

  return (
    <section className="settings-panel" aria-labelledby="rules-h">
      <div className="panel-head">
        <h2 id="rules-h">Regeln dieser Lobby</h2>
      </div>
      <RulesSummary s={s} players={view.lobby.players.length} />
      {!isHost && (
        <p className="host-only" role="note">
          🔒 Nur {hostName} (Host) kann die Regeln ändern.
        </p>
      )}

      <div className="setting">
        <span className="setting-label" id="preset-l">
          Schnellwahl
        </span>
        <div className="presets" role="radiogroup" aria-labelledby="preset-l">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={activePreset?.id === p.id}
              className={`preset ${activePreset?.id === p.id ? 'on' : ''}`}
              disabled={disabled}
              onClick={() => void update({ maxRounds: p.maxRounds, turnSeconds: p.turnSeconds })}
            >
              <strong>{p.label}</strong>
              <span>{p.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <details className="setting-group">
        <summary>Dauer & Zeitlimit</summary>
        <div className="setting">
          <span className="setting-label" id="rounds-l">
            Durchgänge
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="rounds-l">
            {ROUND_OPTIONS.map((r) => (
              <button key={r} role="radio" aria-checked={s.maxRounds === r} className={s.maxRounds === r ? 'on' : ''} disabled={disabled} onClick={() => void update({ maxRounds: r })}>
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
              <button key={t} role="radio" aria-checked={s.turnSeconds === t} className={s.turnSeconds === t ? 'on' : ''} disabled={disabled} onClick={() => void update({ turnSeconds: t })}>
                {t === 0 ? 'ohne' : `${t} s`}
              </button>
            ))}
          </div>
          <span className="setting-hint">Fest: Diskussion 45 s · geheime Wahl 30 s</span>
        </div>
      </details>

      <details className="setting-group">
        <summary>Kategorien ({s.categories.length}/{CATEGORIES.length})</summary>
        <div className="chips-wrap" role="group" aria-label="Kategorien">
          {CATEGORIES.map((c) => {
            const on = s.categories.includes(c.id);
            return (
              <button key={c.id} className={`toggle-chip ${on ? 'on' : ''}`} aria-pressed={on} disabled={disabled} onClick={() => toggleCat(c.id)}>
                <span aria-hidden="true">{c.icon}</span> {c.label}
                {on ? <IconCheck size={13} /> : <IconX size={12} />}
              </button>
            );
          })}
        </div>
        <span className="setting-hint">Die Kategorie der laufenden Partie bleibt geheim – außer mit „Kategorie anzeigen“.</span>
      </details>

      <details className="setting-group">
        <summary>Weitere Regeln</summary>
        <div className="setting-row">
          <label className="switch">
            <input type="checkbox" checked={s.categoryHint} disabled={disabled} onChange={(e) => void update({ categoryHint: e.target.checked })} />
            <span className="switch-ui" aria-hidden="true" />
            <span>Kategorie der Partie für alle anzeigen (auch für den Impostor)</span>
          </label>
          <label className="switch">
            <input type="checkbox" checked={s.scoreboard} disabled={disabled} onChange={(e) => void update({ scoreboard: e.target.checked })} />
            <span className="switch-ui" aria-hidden="true" />
            <span>Lobby-Punktestand anzeigen</span>
          </label>
        </div>
      </details>
    </section>
  );
}

/** Was fehlt noch bis zum Start? */
function StartStatus({ view, onInvite }: { view: ClientView; onInvite: () => void }) {
  const cmd = useCmd();
  const { lobby, me } = view;
  const players = lobby.players;
  const isHost = lobby.hostId === me.id;
  const host = players.find((p) => p.id === lobby.hostId);
  const mine = players.find((p) => p.id === me.id);
  const connected = players.filter((p) => p.connected);
  const offline = players.filter((p) => !p.connected);
  const notReady = connected.filter((p) => !p.ready);
  const missing = Math.max(0, LIMITS.minPlayers - connected.length);
  const canStart = missing === 0 && notReady.length === 0;
  const [starting, setStarting] = useState(false);

  let headline: string;
  if (missing > 0) headline = `Noch ${missing} ${missing === 1 ? 'Person' : 'Personen'} fehlen`;
  else if (notReady.length) headline = `${connected.length - notReady.length} von ${connected.length} bereit`;
  else headline = isHost ? 'Alle bereit – du kannst starten!' : `Alle bereit – ${host?.name ?? 'der Host'} startet`;
  if (missing === 1) headline = 'Noch 1 Person fehlt';

  const startReason =
    missing > 0
      ? `Zum Start fehlen noch ${missing} ${missing === 1 ? 'Person' : 'Personen'} (mindestens ${LIMITS.minPlayers}).`
      : notReady.length
        ? `Warte auf: ${listNames(notReady.map((p) => (p.id === me.id ? 'dich' : p.name)))}.`
        : null;

  return (
    <div className="start-status" aria-live="polite">
      <p className="ss-headline">{headline}</p>
      <ul className="ss-checks">
        <li className={missing === 0 ? 'ok' : ''}>
          {missing === 0 ? <IconCheck size={16} /> : <IconUsers size={16} />}
          {players.length}/{lobby.maxPlayers} am Tisch · mindestens {LIMITS.minPlayers}
        </li>
        <li className={notReady.length === 0 && missing === 0 ? 'ok' : ''}>
          {notReady.length === 0 && missing === 0 ? <IconCheck size={16} /> : <IconClock size={16} />}
          {notReady.length ? `Noch nicht bereit: ${listNames(notReady.map((p) => (p.id === me.id ? 'du' : p.name)))}` : 'Alle Anwesenden sind bereit'}
        </li>
        {offline.length > 0 && (
          <li>
            <IconX size={16} /> Getrennt (zählt nicht mit): {listNames(offline.map((p) => p.name))}
          </li>
        )}
      </ul>
      <div className="ss-actions">
        <motion.button
          className={`btn ready-btn ${mine?.ready ? 'is-ready' : ''}`}
          onClick={() => {
            const next = !mine?.ready;
            play(next ? 'ready' : 'unready');
            void cmd({ t: 'setReady', ready: next });
          }}
          whileTap={{ scale: 0.94 }}
          aria-pressed={!!mine?.ready}
        >
          {mine?.ready ? (
            <>
              <IconCheck /> Ich bin bereit
            </>
          ) : (
            'Bereit melden'
          )}
        </motion.button>
        {isHost ? (
          <button
            className="btn btn-primary start-btn"
            aria-disabled={!canStart}
            aria-describedby="start-reason"
            disabled={starting}
            onClick={async () => {
              if (!canStart) {
                toast(startReason ?? 'Noch nicht startklar.', 'info');
                play('error');
                return;
              }
              setStarting(true);
              play('shuffle');
              await cmd({ t: 'startMatch' });
              setStarting(false);
            }}
          >
            Spiel starten
          </button>
        ) : null}
      </div>
      <p id="start-reason" className="ss-reason">
        {isHost ? (startReason ?? 'Startklar.') : `Nur ${host?.name ?? 'der Host'} (Host) kann das Spiel starten.`}
      </p>
      {players.length < lobby.maxPlayers && (
        <button className="btn btn-ghost btn-small" onClick={onInvite}>
          <IconLink size={16} /> Freunde einladen
        </button>
      )}
      <p className="taboo-note">Tabu als Hinweis: das geheime Wort, seine Formen (z. B. Mehrzahl) und Buchstabieren.</p>
    </div>
  );
}

export function LobbyScreen({ view }: { view: ClientView }) {
  const cmd = useCmd();
  const ui = useUI();
  const narrow = useMediaQuery('(max-width: 820px)');
  const [kickTarget, setKickTarget] = useState<PlayerPublic | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const { lobby, me } = view;
  const isHost = lobby.hostId === me.id;
  const players = lobby.players;
  const spectating = view.spectating;

  // Sitzordnung: Beitrittsreihenfolge, eigener Platz unten. Es gibt genau so viele
  // Plätze wie die Lobby maximal Personen aufnimmt.
  const order = rotateToMe(
    players.map((p) => p.id),
    me.id,
  );
  const positions = seatPositions(lobby.maxPlayers, 41, 38);
  const free = lobby.maxPlayers - players.length;

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

  const seatFor = (p: PlayerPublic, enter?: { x: number; y: number }) => (
    <SeatCard
      player={p}
      enterFrom={enter}
      flags={{
        isMe: p.id === me.id,
        ready: lobby.phase === 'lobby' ? p.ready : false,
        showScore: lobby.settings.scoreboard,
        caption: p.inMatch ? 'spielt' : lobby.phase === 'lobby' ? (p.ready ? 'bereit' : 'wartet') : undefined,
      }}
      onKick={isHost && p.id !== me.id && lobby.phase === 'lobby' ? () => setKickTarget(p) : undefined}
    />
  );

  const center = spectating ? (
    <div className="spectate-note paper">
      <strong>Partie läuft</strong>
      <span>Du spielst ab der nächsten Partie mit.</span>
    </div>
  ) : (
    <StartStatus view={view} onInvite={() => setInviteOpen(true)} />
  );

  return (
    <div className={`lobby ${narrow ? 'is-narrow' : ''}`}>
      <header className="topbar">
        <Logo size="sm" />
        <div className="code-chip" aria-label={`Lobby-Code ${lobby.code.split('').join(' ')}`}>
          <span className="code-label">Code</span>
          <span className="code-value">{lobby.code}</span>
          <CopyButton text={lobby.code} label="Kopieren" className="btn btn-small btn-ghost chip-btn" />
        </div>
        <button className="btn btn-small btn-primary invite-btn" onClick={() => setInviteOpen(true)}>
          <IconLink size={16} /> Einladen
        </button>
        <div className="top-actions">
          <button className="btn btn-ghost btn-small" onClick={ui.openRules} aria-label="Spielregeln (F1)">
            <IconBook size={18} /> <span className="hide-narrow">Regeln</span>
          </button>
          <button className="icon-btn" onClick={ui.openSettings} aria-label="Einstellungen" title="Einstellungen">
            <IconGear />
          </button>
          <button className="icon-btn" onClick={() => setLeaveOpen(true)} aria-label="Lobby verlassen" title="Lobby verlassen">
            <IconDoor />
          </button>
        </div>
      </header>

      <div className="lobby-body">
        <section className="table-area" aria-label={`Spieltisch: ${players.length} von ${lobby.maxPlayers} Plätzen belegt`}>
          {narrow ? (
            <div className="narrow-table">
              {center}
              <h2 className="panel-mini-title">
                Am Tisch · {players.length}/{lobby.maxPlayers} Plätze belegt
              </h2>
              <div className="seat-grid">
                {order.map((id) => {
                  const p = players.find((x) => x.id === id)!;
                  return <div key={id}>{seatFor(p)}</div>;
                })}
              </div>
              {free > 0 && <p className="muted small">{free} Plätze frei</p>}
            </div>
          ) : (
            <TableSurface mood="calm">
              <AnimatePresence>
                {positions.map((pos, i) => {
                  const id = order[i];
                  const p = id ? players.find((x) => x.id === id) : undefined;
                  return (
                    <SeatSlot key={p ? p.id : `empty-${i}`} pos={pos}>
                      {p ? seatFor(p, p.id === me.id ? undefined : { x: (50 - pos.x) * 6, y: (50 - pos.y) * 6 }) : <EmptySeat />}
                    </SeatSlot>
                  );
                })}
              </AnimatePresence>
              <div className="table-center lobby-center">{center}</div>
              <p className="seat-counter" aria-hidden="true">
                {players.length}/{lobby.maxPlayers} Plätze belegt
              </p>
            </TableSurface>
          )}
        </section>

        <aside className="lobby-side">
          <SettingsPanel view={view} />
          <ChatPanel view={view} title="Lobby-Chat" compact />
        </aside>
      </div>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} code={lobby.code} />

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
        <p>
          Du kannst mit dem Code <strong>{lobby.code}</strong> wieder beitreten, solange die Lobby besteht.
          {isHost && players.length > 1 ? ' Die Hostrolle geht an die am längsten anwesende Person.' : ''}
        </p>
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
