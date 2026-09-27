import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AVATARS, DisplayNameSchema } from '@liked/protocol';
import { t } from '../i18n/de';
import { api } from '../lib/api';
import { createRoom, joinRoom, startSoloDemo } from '../lib/net';
import { get, set, toast, useStore } from '../state/store';
import { Avatar, Button, Icon, Panel, useSavedFlash } from '../components/ui';
import { TikTokChip } from './TikTokPanel';

async function saveProfile(patch: { name?: string; avatar?: string }) {
  const s = await api.settings.set({ profile: { ...get().settings!.profile, ...patch } });
  set({ settings: s });
}

export function nameError(raw: string): string | null {
  const trimmed = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (trimmed.length < 2) return t.profile.errors.short;
  if (trimmed.length > 20) return t.profile.errors.long;
  return DisplayNameSchema.safeParse(raw).success ? null : t.profile.errors.chars;
}

/** Profil mit automatischer Speicherung und sichtbarer Bestätigung. */
export function ProfileEditor({ compact, autoFocus }: { compact?: boolean; autoFocus?: boolean }) {
  const settings = useStore((s) => s.settings)!;
  const [name, setName] = useState(settings.profile.name);
  const [touched, setTouched] = useState(false);
  const [saved, flash] = useSavedFlash();
  const err = nameError(name);
  const showErr = (touched || name.length > 0) && err;
  const commitName = async () => {
    setTouched(true);
    if (err) return;
    const clean = DisplayNameSchema.parse(name);
    if (clean !== settings.profile.name) {
      await saveProfile({ name: clean });
      flash();
    }
  };
  return (
    <div className={`profile-editor ${compact ? 'compact' : ''}`}>
      <label className="field">
        <span className="field-label">
          {t.profile.name}
          <small className="counter" aria-hidden="true">{name.trim().length}/20</small>
        </span>
        <input
          value={name}
          maxLength={24}
          placeholder={t.profile.namePlaceholder}
          autoFocus={autoFocus}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void commitName()}
          onKeyDown={(e) => e.key === 'Enter' && void commitName()}
          aria-invalid={!!showErr}
          aria-describedby="name-msg"
        />
        <span id="name-msg" className={`field-msg ${showErr ? 'error' : saved ? 'ok' : ''}`} aria-live="polite">
          {showErr ? (
            <>
              <Icon name="alert" size={14} /> {err}
            </>
          ) : saved ? (
            <>
              <Icon name="check" size={14} /> {t.profile.saved}
            </>
          ) : (
            t.profile.autosave
          )}
        </span>
      </label>
      <div className="field">
        <span className="field-label">{t.profile.avatar}</span>
        <div className="avatar-picker" role="radiogroup" aria-label={t.profile.avatar}>
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={settings.profile.avatar === a}
              aria-label={t.avatarName(a)}
              title={t.avatarName(a)}
              className={settings.profile.avatar === a ? 'active' : ''}
              onClick={async () => {
                await saveProfile({ avatar: a });
                flash();
              }}
            >
              <Avatar avatar={a} size={compact ? 34 : 42} />
            </button>
          ))}
        </div>
      </div>
      {!compact && <p className="hint">{t.profile.hint}</p>}
    </div>
  );
}

function hasValidName(): boolean {
  return !nameError(get().settings?.profile.name ?? '');
}

function ProfileCard() {
  const settings = useStore((s) => s.settings)!;
  const [editing, setEditing] = useState(!settings.profile.name);
  return (
    <Panel
      className="profile-card"
      title={t.profile.title}
      actions={
        settings.profile.name ? (
          <Button size="sm" variant="quiet" icon={editing ? 'check' : 'edit'} onClick={() => setEditing(!editing)} aria-expanded={editing}>
            {editing ? t.common.close : t.common.edit}
          </Button>
        ) : null
      }
    >
      {editing ? (
        <ProfileEditor compact autoFocus={!settings.profile.name} />
      ) : (
        <div className="profile-preview">
          <Avatar avatar={settings.profile.avatar} size={52} label={t.avatarName(settings.profile.avatar)} />
          <div>
            <strong>{settings.profile.name}</strong>
            <small>{t.profile.hint}</small>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function MainMenu() {
  const needName = () => {
    if (hasValidName()) return false;
    toast(t.menu.needName, 'warn');
    return true;
  };
  return (
    <div className="screen home-screen">
      <div className="home-wrap">
        <motion.header className="home-head" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <h1 className="logo" aria-label="LIKED">
            <span className="logo-text">LIKED</span>
            <Icon name="heart" size={34} className="logo-heart" />
          </h1>
          <p className="tagline">{t.tagline}</p>
          <p className="players-line">
            <Icon name="users" size={16} /> {t.menu.players}
          </p>
        </motion.header>

        <div className="home-grid">
          <main className="home-main">
            <div className="action-cards">
              <button className="action-card primary" onClick={() => !needName() && set({ screen: 'create' })}>
                <Icon name="sparkle" size={26} />
                <span className="action-text">
                  <strong>{t.menu.create}</strong>
                  <small>{t.menu.createHint}</small>
                </span>
              </button>
              <button className="action-card" onClick={() => !needName() && set({ screen: 'join' })}>
                <Icon name="users" size={26} />
                <span className="action-text">
                  <strong>{t.menu.join}</strong>
                  <small>{t.menu.joinHint}</small>
                </span>
              </button>
            </div>
            <button className="solo-card" onClick={() => startSoloDemo()}>
              <Icon name="play" size={22} />
              <span className="action-text">
                <strong>{t.menu.solo}</strong>
                <small>{t.menu.soloHint}</small>
              </span>
              <Icon name="arrowRight" size={20} className="solo-arrow" />
            </button>
            <nav className="home-links" aria-label="Weitere">
              <Button variant="quiet" icon="book" onClick={() => set({ screen: 'rules', returnTo: 'menu' })}>
                {t.menu.rules}
              </Button>
              <Button variant="quiet" icon="eye" onClick={() => set({ screen: 'intro' })}>
                {t.menu.howTo}
              </Button>
              <Button variant="quiet" icon="gear" onClick={() => set({ screen: 'settings', settingsTab: 'profile' })}>
                {t.menu.settings}
              </Button>
              <Button variant="quiet" icon="logout" onClick={() => api.app.quit()}>
                {t.menu.quit}
              </Button>
            </nav>
          </main>

          <aside className="home-side">
            <ProfileCard />
            <TikTokChip />
          </aside>
        </div>
      </div>
    </div>
  );
}

export function CreateRoom() {
  const tiktok = useStore((s) => s.tiktok);
  const [busy, setBusy] = useState(false);
  const hasLikes = !!tiktok?.index && tiktok.index.count > 0;
  const go = async (mode: 'tiktok' | 'demo') => {
    setBusy(true);
    const err = await createRoom(mode);
    setBusy(false);
    if (err) toast(err, 'error');
  };
  return (
    <div className="screen narrow-screen">
      <Button variant="quiet" icon="arrowLeft" onClick={() => set({ screen: 'menu' })}>
        {t.common.back}
      </Button>
      <h2 className="screen-title">{t.menu.createTitle}</h2>
      <div className="mode-grid">
        <button className="mode-card" disabled={busy || !hasLikes} onClick={() => void go('tiktok')} aria-describedby={!hasLikes ? 'tiktok-missing' : undefined}>
          <Icon name="heart" size={30} />
          <strong>{t.menu.modeTikTok}</strong>
          <span>{t.menu.modeTikTokHint}</span>
          {!hasLikes && (
            <em className="mode-missing" id="tiktok-missing">
              <Icon name="info" size={14} /> {t.menu.needTikTok}
            </em>
          )}
        </button>
        <button className="mode-card" disabled={busy} onClick={() => void go('demo')}>
          <Icon name="film" size={30} />
          <strong>{t.menu.modeDemo}</strong>
          <span>{t.menu.modeDemoHint}</span>
        </button>
        <button className="mode-card" disabled={busy} onClick={() => startSoloDemo()}>
          <Icon name="play" size={30} />
          <strong>{t.menu.modeSolo}</strong>
          <span>{t.menu.modeSoloHint}</span>
        </button>
      </div>
      {!hasLikes && (
        <Button variant="secondary" icon="heart" onClick={() => set({ screen: 'settings', settingsTab: 'tiktok' })}>
          {t.tiktok.connect}
        </Button>
      )}
    </div>
  );
}

export function parseCodeInput(raw: string): string {
  const m = /(?:join\/|code=)([A-Za-z0-9]{6})/.exec(raw);
  return (m?.[1] ?? raw).replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
}

export function JoinRoom() {
  const prefill = useStore((s) => s.prefillCode);
  const [code, setCode] = useState(prefill);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const go = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    const err = await joinRoom(code);
    setBusy(false);
    if (err) toast(err, 'error');
    else set({ prefillCode: '' });
  };
  return (
    <div className="screen narrow-screen">
      <Button variant="quiet" icon="arrowLeft" onClick={() => set({ screen: 'menu' })}>
        {t.common.back}
      </Button>
      <h2 className="screen-title">{t.menu.joinTitle}</h2>
      <p className="lead">{t.menu.joinHint}</p>
      <form
        className="join-form"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <input
          ref={input}
          className="code-input"
          value={code}
          aria-label="Raumcode"
          placeholder={t.menu.codePlaceholder}
          onChange={(e) => setCode(parseCodeInput(e.target.value))}
          onPaste={(e) => {
            e.preventDefault();
            setCode(parseCodeInput(e.clipboardData.getData('text')));
          }}
          spellCheck={false}
          autoComplete="off"
        />
        <Button variant="primary" size="lg" icon="users" disabled={busy || code.length !== 6} type="submit">
          {t.menu.joinButton}
        </Button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Einführung                                                          */
/* ------------------------------------------------------------------ */

function IntroVisual({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className="intro-visual" aria-hidden="true">
        <div className="iv-phone">
          <Icon name="heart" size={28} />
          <span>12.4K</span>
        </div>
        <Icon name="arrowRight" size={24} className="iv-arrow" />
        <div className="iv-list">
          {['fox', 'owl', 'frog'].map((a) => (
            <div key={a} className="iv-row">
              <Avatar avatar={a} size={26} />
              <span className="iv-bar" />
              <Icon name="heart" size={14} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (step === 1) {
    return (
      <div className="intro-visual" aria-hidden="true">
        <div className="iv-clip">
          <span className="iv-emoji">🐈</span>
          <span className="iv-progress" />
        </div>
        <div className="iv-answers">
          {[
            ['owl', 'Mila'],
            ['frog', 'Jonas'],
            ['cat', 'Lea']
          ].map(([a, n], i) => (
            <div key={a} className={`iv-answer ${i === 1 ? 'picked' : ''}`}>
              <Avatar avatar={a!} size={26} />
              <span>{n}</span>
              {i === 1 && <Icon name="check" size={14} />}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="intro-visual" aria-hidden="true">
      <div className="iv-points">
        <div className="iv-point-row">
          <Avatar avatar="frog" size={28} />
          <span>Jonas</span>
          <span className="iv-chip ok">
            <Icon name="check" size={12} /> #1
          </span>
          <span className="iv-chip streak">3er-Serie ×1,10</span>
          <strong>+1.100</strong>
        </div>
        <div className="iv-point-row">
          <Avatar avatar="owl" size={28} />
          <span>Mila</span>
          <span className="iv-chip ok">
            <Icon name="check" size={12} /> #2
          </span>
          <strong>+850</strong>
        </div>
        <div className="iv-point-row dim">
          <Avatar avatar="cat" size={28} />
          <span>Lea</span>
          <span className="iv-chip bad">
            <Icon name="x" size={12} /> Falsch
          </span>
          <strong>0</strong>
        </div>
      </div>
    </div>
  );
}

export function Intro() {
  const slides = t.intro.slides;
  const total = slides.length + 1;
  const [i, setI] = useState(0);
  const finish = async (next?: 'solo' | 'create') => {
    const s = await api.settings.set({ introSeen: true });
    set({ settings: s, screen: 'menu' });
    if (next === 'solo') startSoloDemo();
    if (next === 'create') set({ screen: hasValidName() ? 'create' : 'menu' });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'BUTTON' && e.key === 'Enter') return;
      if (e.key === 'Escape') void finish();
      if (e.key === 'ArrowRight' && i < total - 1) setI(i + 1);
      if (e.key === 'ArrowLeft' && i > 0) setI(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const last = i === total - 1;
  const s = slides[i];
  return (
    <div className="screen intro-screen">
      <motion.div key={i} className="intro-card" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }} aria-live="polite">
        <div className="intro-step">{t.intro.step(i + 1, total)}</div>
        {s ? (
          <>
            <IntroVisual step={i} />
            <h2>{s.title}</h2>
            <p>{s.text}</p>
          </>
        ) : (
          <>
            <h2>{t.intro.finishTitle}</h2>
            <p>{t.intro.finishText}</p>
            <div className="intro-finish">
              <Button variant="primary" size="lg" icon="play" onClick={() => void finish('solo')}>
                {t.menu.solo}
              </Button>
              <Button variant="secondary" size="lg" icon="sparkle" onClick={() => void finish('create')}>
                {t.menu.create}
              </Button>
              <Button variant="quiet" icon="book" onClick={async () => {
                await finish();
                set({ screen: 'rules', returnTo: 'menu' });
              }}>
                {t.menu.rules}
              </Button>
            </div>
          </>
        )}
      </motion.div>
      <div className="intro-actions">
        {i > 0 ? (
          <Button variant="quiet" icon="arrowLeft" onClick={() => setI(i - 1)}>
            {t.intro.back}
          </Button>
        ) : (
          <Button variant="quiet" onClick={() => void finish()}>
            {t.intro.skip}
          </Button>
        )}
        <div className="intro-dots" aria-hidden="true">
          {Array.from({ length: total }, (_, k) => (
            <span key={k} className={k === i ? 'active' : ''} />
          ))}
        </div>
        {!last ? (
          <Button variant="primary" iconRight="arrowRight" onClick={() => setI(i + 1)}>
            {t.intro.next}
          </Button>
        ) : (
          <Button variant="quiet" onClick={() => void finish()}>
            {t.intro.skip}
          </Button>
        )}
      </div>
    </div>
  );
}
