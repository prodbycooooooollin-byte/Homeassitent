import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, LIMITS } from '../../../shared/protocol.ts';
import { estimateDuration } from '../../../shared/duration.ts';
import { useCmd, useUI } from '../App.tsx';
import { play } from '../audio/sound.ts';
import { connection, useConnection } from '../net/connection.ts';
import { hostPrefs, useProfile } from '../state/storage.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { CardBack, Dialog, Logo } from '../ui/common.tsx';
import { ConnectionLine } from '../ui/ConnectionStatus.tsx';
import { IconArrowRight, IconBook, IconChat, IconClock, IconEye, IconGear, IconUsers, IconVote } from '../ui/Icons.tsx';
import { clearInviteFromUrl, codeProblem, extractLobbyCode, invitedCode } from './invite.ts';
import { ProfileEditor } from './ProfileSetup.tsx';

const typical = estimateDuration(5, DEFAULT_SETTINGS.maxRounds, DEFAULT_SETTINGS.turnSeconds);

export function Home() {
  const conn = useConnection();
  const profile = useProfile();
  const ui = useUI();
  const cmd = useCmd();
  const [code, setCode] = useState(() => invitedCode() ?? '');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [editProfile, setEditProfile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const online = conn.status === 'online';
  const autoJoined = useRef(false);

  const join = async (c = code) => {
    const problem = codeProblem(c);
    if (problem) {
      setJoinError(problem);
      play('error');
      inputRef.current?.focus();
      return;
    }
    setBusy('join');
    setJoinError(null);
    const r = await cmd({ t: 'joinLobby', code: c }, { quiet: true });
    setBusy(null);
    if (!r.ok) {
      setJoinError(r.message);
      play('error');
      inputRef.current?.focus();
    } else {
      play('join');
      clearInviteFromUrl();
    }
  };

  // Einladungslink (?lobby=CODE): nach dem Verbinden automatisch beitreten.
  useEffect(() => {
    const invite = invitedCode();
    if (online && !autoJoined.current && invite) {
      autoJoined.current = true;
      void join(invite);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const create = async () => {
    setBusy('create');
    const r = await cmd({ t: 'createLobby' });
    if (r.ok) {
      play('join');
      // Bewusst gespeicherte Host-Präferenzen übernehmen.
      const prefs = hostPrefs.get();
      if (prefs) void connection.send({ t: 'updateSettings', settings: prefs });
    }
    setBusy(null);
  };

  const offlineReason = !online ? 'Warte auf Verbindung zum Spielserver …' : null;

  return (
    <div className="home">
      <header className="home-top">
        <button className="profile-chip" onClick={() => setEditProfile(true)} aria-label={`Profil bearbeiten: ${profile.name}`}>
          <Avatar id={profile.avatar} size={36} />
          <span className="profile-chip-name">{profile.name}</span>
          <span className="profile-chip-edit" aria-hidden="true">
            ändern
          </span>
        </button>
        <div className="top-actions">
          <button className="btn btn-ghost btn-small" onClick={ui.openRules}>
            <IconBook size={18} /> So funktioniert’s
          </button>
          <button className="icon-btn" onClick={ui.openSettings} aria-label="Einstellungen" title="Einstellungen">
            <IconGear />
          </button>
        </div>
      </header>

      <main className="home-main">
        <div className="home-hero">
          <div className="hero-cards" aria-hidden="true">
            {[-16, -5, 6, 17].map((r, i) => (
              <motion.div
                key={i}
                className="hero-card"
                initial={{ y: 60, rotate: 0, opacity: 0 }}
                animate={{ x: [-54, -18, 18, 54][i], y: i === 2 ? -14 : 0, rotate: r, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.07, type: 'spring', stiffness: 200, damping: 20 }}
              >
                {i === 2 ? (
                  <div className="hero-face paper">
                    <span className="hero-q">?</span>
                  </div>
                ) : (
                  <CardBack />
                )}
              </motion.div>
            ))}
          </div>
          <Logo />
          <p className="tagline">Alle kennen das Wort. Eine Person nicht. Findet sie – oder bluff dich durch.</p>
          <ul className="facts" aria-label="Auf einen Blick">
            <li>
              <IconUsers size={18} /> {LIMITS.minPlayers}–{LIMITS.maxPlayers} Personen
            </li>
            <li>
              <IconClock size={18} /> {typical.label} pro Partie*
            </li>
            <li>
              <IconChat size={18} /> Hinweise tippt ihr in der App – reden gern parallel über Discord o. Ä.
            </li>
          </ul>
        </div>

        <div className="home-actions">
          <section className="action-card paper action-create" aria-labelledby="create-title">
            <span className="action-icon" aria-hidden="true">
              <IconUsers size={30} />
            </span>
            <h2 className="action-title" id="create-title">
              Neue Lobby
            </h2>
            <p className="action-sub">Du bist Host, legst die Regeln fest und lädst per Code, Link oder QR-Code ein.</p>
            <button className="btn btn-primary btn-lg btn-block" onClick={create} disabled={!online || busy !== null} title={offlineReason ?? undefined}>
              {busy === 'create' ? 'Erstelle …' : 'Lobby erstellen'} <IconArrowRight />
            </button>
          </section>

          <form
            className="action-card paper action-join"
            aria-labelledby="join-title"
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
          >
            <span className="action-icon" aria-hidden="true">
              <IconArrowRight size={30} />
            </span>
            <h2 className="action-title" id="join-title">
              Lobby beitreten
            </h2>
            <label className="action-sub" htmlFor="join-code">
              Code eingeben oder Einladungslink einfügen
            </label>
            <div className="code-input-wrap" onClick={() => inputRef.current?.focus()}>
              <input
                id="join-code"
                ref={inputRef}
                className="code-input"
                value={code}
                onChange={(e) => {
                  setCode(extractLobbyCode(e.target.value));
                  setJoinError(null);
                }}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                aria-invalid={!!joinError}
                aria-describedby="join-error"
              />
              <div className="code-slots" aria-hidden="true">
                {Array.from({ length: LIMITS.lobbyCodeLength }, (_, i) => (
                  <span key={i} className={`code-slot ${code[i] ? 'filled' : ''} ${i === code.length ? 'caret' : ''}`}>
                    {code[i] ?? ''}
                  </span>
                ))}
              </div>
            </div>
            <span id="join-error" className="join-error" role="alert">
              {joinError}
            </span>
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!online || busy !== null || code.length === 0} title={offlineReason ?? undefined}>
              {busy === 'join' ? 'Trete bei …' : 'Beitreten'} <IconArrowRight />
            </button>
          </form>
        </div>

        <section className="how" aria-labelledby="how-title">
          <h2 id="how-title" className="how-title">
            So funktioniert’s
          </h2>
          <ol className="how-steps">
            <li>
              <IconEye size={22} />
              <span>
                <strong>Rolle ansehen</strong>Alle außer dem Impostor sehen das geheime Wort.
              </span>
            </li>
            <li>
              <IconChat size={22} />
              <span>
                <strong>Hinweise geben</strong>Reihum ein kurzer Hinweis – ohne das Wort zu verraten.
              </span>
            </li>
            <li>
              <IconVote size={22} />
              <span>
                <strong>Diskutieren & abstimmen</strong>Findet den Impostor. Er darf bis zur Wahl einmal das Wort raten.
              </span>
            </li>
          </ol>
          <button className="btn btn-ghost btn-small" onClick={ui.openRules}>
            Alle Regeln lesen
          </button>
        </section>

        <ConnectionLine />
        <p className="footnote">* Schätzung für 5 Personen mit Standardregeln. Abstimmungen und Rateversuche können eine Partie früher beenden.</p>
      </main>

      <Dialog open={editProfile} onClose={() => setEditProfile(false)} title="Profil bearbeiten">
        <ProfileEditor submitLabel="Speichern" onDone={() => setEditProfile(false)} onCancel={() => setEditProfile(false)} />
      </Dialog>
    </div>
  );
}
