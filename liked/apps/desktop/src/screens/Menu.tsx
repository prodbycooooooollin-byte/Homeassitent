import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AVATARS, DisplayNameSchema } from '@liked/protocol';
import { t } from '../i18n/de';
import { api } from '../lib/api';
import { createRoom, joinRoom } from '../lib/net';
import { get, set, toast, useStore } from '../state/store';
import { Avatar, Button, DemoBadge, Icon, Panel } from '../components/ui';
import { TikTokChip } from './TikTokPanel';

async function saveProfile(patch: { name?: string; avatar?: string }) {
  const s = await api.settings.set({ profile: { ...get().settings!.profile, ...patch } });
  set({ settings: s });
}

export function ProfileEditor({ compact }: { compact?: boolean }) {
  const settings = useStore((s) => s.settings)!;
  const [name, setName] = useState(settings.profile.name);
  const valid = DisplayNameSchema.safeParse(name).success;
  return (
    <div className={`profile-editor ${compact ? 'compact' : ''}`}>
      <label className="field">
        <span>{t.profile.name}</span>
        <input
          value={name}
          maxLength={20}
          placeholder="z. B. Mia"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => valid && void saveProfile({ name: DisplayNameSchema.parse(name) })}
          aria-invalid={!valid}
        />
      </label>
      <div className="field">
        <span>{t.profile.avatar}</span>
        <div className="avatar-picker" role="radiogroup" aria-label={t.profile.avatar}>
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={settings.profile.avatar === a} className={settings.profile.avatar === a ? 'active' : ''} onClick={() => void saveProfile({ avatar: a })}>
              <Avatar avatar={a} size={compact ? 36 : 44} />
            </button>
          ))}
        </div>
      </div>
      {!compact && <p className="hint">{t.profile.hint}</p>}
    </div>
  );
}

function needName(): boolean {
  const ok = DisplayNameSchema.safeParse(get().settings?.profile.name ?? '').success;
  if (!ok) toast(t.menu.needName, 'warn');
  return !ok;
}

export function MainMenu() {
  const settings = useStore((s) => s.settings)!;
  return (
    <div className="screen menu-screen">
      <motion.div className="menu-hero" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
        <h1 className="logo" aria-label="LIKED">
          <span className="logo-text">LIKED</span>
          <Icon name="heart" size={48} className="logo-heart" />
        </h1>
        <p className="tagline">{t.tagline}</p>
      </motion.div>

      <div className="menu-body">
        <motion.nav className="menu-actions" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }}>
          {[
            { key: 'create', label: t.menu.create, icon: 'sparkle', variant: 'primary' as const, on: () => !needName() && set({ screen: 'create' }) },
            { key: 'join', label: t.menu.join, icon: 'users', variant: 'cyan' as const, on: () => !needName() && set({ screen: 'join' }) },
            { key: 'settings', label: t.menu.settings, icon: 'gear', variant: 'secondary' as const, on: () => set({ screen: 'settings', settingsTab: 'profile' }) },
            { key: 'howto', label: t.menu.howTo, icon: 'eye', variant: 'ghost' as const, on: () => set({ screen: 'intro' }) },
            { key: 'quit', label: t.menu.quit, icon: 'logout', variant: 'ghost' as const, on: () => api.app.quit() }
          ].map((b) => (
            <motion.div key={b.key} variants={{ hidden: { opacity: 0, x: -20 }, show: { opacity: 1, x: 0 } }}>
              <Button variant={b.variant} size={b.key === 'create' || b.key === 'join' ? 'xl' : 'lg'} icon={b.icon} onClick={b.on} className="menu-btn">
                {b.label}
              </Button>
            </motion.div>
          ))}
        </motion.nav>

        <motion.aside className="menu-side" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1, duration: 0.4 }}>
          <Panel title={t.profile.title}>
            <ProfileEditor compact />
          </Panel>
          <TikTokChip />
          <p className="server-line">
            <Icon name="wifi" size={14} /> {settings.serverUrl}
          </p>
        </motion.aside>
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
      <Button variant="ghost" icon="arrowLeft" onClick={() => set({ screen: 'menu' })}>
        {t.common.back}
      </Button>
      <h2 className="screen-title">{t.menu.createTitle}</h2>
      <div className="mode-grid">
        <button className="mode-card" disabled={busy || !hasLikes} onClick={() => void go('tiktok')}>
          <Icon name="heart" size={40} />
          <strong>{t.menu.modeTikTok}</strong>
          <span>{t.menu.modeTikTokHint}</span>
          {!hasLikes && <em className="mode-missing">{t.menu.needTikTok}</em>}
        </button>
        <button className="mode-card demo" disabled={busy} onClick={() => void go('demo')}>
          <Icon name="play" size={40} />
          <strong>{t.menu.modeDemo}</strong>
          <span>{t.menu.modeDemoHint}</span>
          <DemoBadge text={t.common.demo} />
        </button>
      </div>
      {!hasLikes && (
        <Button variant="cyan" icon="heart" onClick={() => set({ screen: 'settings', settingsTab: 'tiktok' })}>
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
    if (code.length !== 6) return;
    setBusy(true);
    const err = await joinRoom(code);
    setBusy(false);
    if (err) toast(err, 'error');
    else set({ prefillCode: '' });
  };
  return (
    <div className="screen narrow-screen">
      <Button variant="ghost" icon="arrowLeft" onClick={() => set({ screen: 'menu' })}>
        {t.common.back}
      </Button>
      <h2 className="screen-title">{t.menu.joinTitle}</h2>
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
        <Button variant="cyan" size="xl" icon="users" disabled={busy || code.length !== 6} type="submit" onClick={() => void go()}>
          {t.menu.joinButton}
        </Button>
      </form>
    </div>
  );
}

export function Intro() {
  const [i, setI] = useState(0);
  const slides = t.intro.slides;
  const finish = async () => {
    const s = await api.settings.set({ introSeen: true });
    set({ settings: s, screen: 'menu' });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void finish();
      if (e.key === 'ArrowRight' || e.key === 'Enter') i < slides.length - 1 ? setI(i + 1) : void finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const s = slides[i]!;
  return (
    <div className="screen intro-screen">
      <motion.div key={i} className="intro-card" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
        <div className="intro-step">{i + 1} / {slides.length}</div>
        <h2>{s.title}</h2>
        <p>{s.text}</p>
      </motion.div>
      <div className="intro-actions">
        <Button variant="ghost" onClick={() => void finish()}>
          {t.intro.skip}
        </Button>
        <div className="intro-dots">
          {slides.map((_, k) => (
            <span key={k} className={k === i ? 'active' : ''} />
          ))}
        </div>
        <Button variant="primary" onClick={() => (i < slides.length - 1 ? setI(i + 1) : void finish())}>
          {i < slides.length - 1 ? t.intro.next : t.intro.done}
        </Button>
      </div>
    </div>
  );
}
