import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { LIMITS, isValidLobbyCode, normalizeLobbyCode } from '../../../shared/protocol.ts';
import { useCmd, useUI } from '../App.tsx';
import { play } from '../audio/sound.ts';
import { useConnection } from '../net/connection.ts';
import { useProfile } from '../state/storage.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { CardBack, Dialog, Logo } from '../ui/common.tsx';
import { IconArrowRight, IconBook, IconGear, IconUsers } from '../ui/Icons.tsx';
import { ProfileEditor } from './ProfileSetup.tsx';

function lobbyFromUrl(): string {
  try {
    return normalizeLobbyCode(new URLSearchParams(location.search).get('lobby') ?? '');
  } catch {
    return '';
  }
}

export function Home() {
  const conn = useConnection();
  const profile = useProfile();
  const ui = useUI();
  const cmd = useCmd();
  const [code, setCode] = useState(lobbyFromUrl);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [editProfile, setEditProfile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const online = conn.status === 'online';
  const autoJoined = useRef(false);

  const join = async (c = code) => {
    if (!isValidLobbyCode(c)) {
      setJoinError('Der Code hat fünf Zeichen, z. B. „K7QXM".');
      return;
    }
    setBusy('join');
    setJoinError(null);
    const r = await cmd({ t: 'joinLobby', code: c }, { quiet: true });
    setBusy(null);
    if (!r.ok) {
      setJoinError(r.message);
      play('error');
    } else {
      play('join');
      if (location.search) history.replaceState(null, '', location.pathname);
    }
  };

  // Einladungslink (?lobby=CODE): nach dem Verbinden automatisch beitreten.
  useEffect(() => {
    if (online && !autoJoined.current && isValidLobbyCode(code) && lobbyFromUrl() === code) {
      autoJoined.current = true;
      void join(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const create = async () => {
    setBusy('create');
    const r = await cmd({ t: 'createLobby' });
    setBusy(null);
    if (r.ok) play('join');
  };

  return (
    <div className="home">
      <header className="home-top">
        <button className="profile-chip" onClick={() => setEditProfile(true)} aria-label={`Profil bearbeiten: ${profile.name}`}>
          <Avatar id={profile.avatar} size={36} />
          <span>{profile.name}</span>
        </button>
        <div className="top-actions">
          <button className="icon-btn" onClick={ui.openRules} aria-label="Spielregeln">
            <IconBook />
          </button>
          <button className="icon-btn" onClick={ui.openSettings} aria-label="Einstellungen">
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
        </div>

        <div className="home-actions">
          <motion.button
            className="action-card paper action-create"
            onClick={create}
            disabled={!online || busy !== null}
            whileHover={{ y: -6, rotate: -1 }}
            whileTap={{ scale: 0.97 }}
            onMouseEnter={() => play('hover')}
          >
            <span className="action-icon">
              <IconUsers size={30} />
            </span>
            <span className="action-title">Lobby erstellen</span>
            <span className="action-sub">Du bist Host und lädst per Code ein.</span>
          </motion.button>

          <motion.form
            className="action-card paper action-join"
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
            whileHover={{ y: -6, rotate: 1 }}
          >
            <span className="action-title">Lobby beitreten</span>
            <label className="sr-only" htmlFor="join-code">
              Lobby-Code
            </label>
            <div className="code-input-wrap" onClick={() => inputRef.current?.focus()}>
              <input
                id="join-code"
                ref={inputRef}
                className="code-input"
                value={code}
                onChange={(e) => {
                  setCode(normalizeLobbyCode(e.target.value));
                  setJoinError(null);
                }}
                maxLength={LIMITS.lobbyCodeLength}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!joinError}
                aria-describedby="join-error"
                placeholder="CODE"
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
            <button className="btn btn-primary" type="submit" disabled={!online || busy !== null || code.length < LIMITS.lobbyCodeLength}>
              Beitreten <IconArrowRight />
            </button>
          </motion.form>
        </div>
        <p className={`server-status ${online ? 'ok' : ''}`}>
          <span className="dot" aria-hidden="true" />
          {online ? 'Mit dem Spielserver verbunden' : conn.failures > 2 ? 'Server nicht erreichbar – Adresse in den Einstellungen prüfen' : 'Verbinde mit dem Spielserver …'}
        </p>
      </main>

      <Dialog open={editProfile} onClose={() => setEditProfile(false)} title="Profil">
        <ProfileEditor submitLabel="Speichern" onDone={() => setEditProfile(false)} />
      </Dialog>
    </div>
  );
}
