import { Component, useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { t } from './i18n/de';
import { api } from './lib/api';
import { maybeSubmitPool, tryResumeLastRoom } from './lib/net';
import { sound } from './lib/sound';
import { get, set, useStore } from './state/store';
import { Background } from './components/Background';
import { Icon, useServerNow } from './components/ui';
import { CreateRoom, Intro, JoinRoom, MainMenu } from './screens/Menu';
import { Settings } from './screens/Settings';
import { Lobby } from './screens/Lobby';
import { RoundScreen } from './screens/Round';
import { RevealScreen, ScoreboardScreen } from './screens/Reveal';
import { ResultsScreen, WaitingScreen } from './screens/Results';

function useBoot() {
  useEffect(() => {
    let unsubs: (() => void)[] = [];
    void (async () => {
      const [settings, tiktok, info] = await Promise.all([api.settings.get(), api.tiktok.overview(), api.app.info()]);
      sound.configure(settings.audio);
      set({ settings, tiktok, screen: settings.introSeen ? 'menu' : 'intro' });
      unsubs = [
        api.tiktok.onStatus((o) => {
          const prevReady = get().tiktok?.status.kind === 'ready';
          set({ tiktok: o });
          if (!prevReady && o.status.kind === 'ready') void maybeSubmitPool(undefined, true);
        }),
        api.updates.onStatus((u) => set({ update: u })),
        api.onDeepLink((code) => set({ prefillCode: code, screen: 'join' }))
      ];
      if (info.smokeTest) {
        // Installierte App: Oberfläche geladen, Grundfunktionen erreichbar → Erfolg melden.
        const ok = !!document.querySelector('.app-root') && typeof settings.profile.deviceId === 'string';
        window.setTimeout(() => api.app.smokeTestDone(ok), 1500);
        return;
      }
      await tryResumeLastRoom();
      // Update-Prüfung im Hintergrund (Installation nie automatisch).
      if (info.packaged) void api.updates.check().then((u) => set({ update: u }));
    })();
    // Erste Interaktion schaltet Audio frei.
    const unlock = () => {
      sound.unlock();
      sound.startMusic();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => unsubs.forEach((u) => u());
  }, []);
}

function useReducedMotion() {
  const pref = useStore((s) => s.settings?.display.reducedMotion ?? 'system');
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      const on = pref === 'on' || (pref === 'system' && mq.matches);
      set({ reducedMotion: on });
      document.documentElement.classList.toggle('reduced-motion', on);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
}

function ReconnectOverlay() {
  const deadline = useStore((s) => s.reconnectDeadline);
  const now = useServerNow(250);
  const offset = useStore((s) => s.clockOffset);
  if (deadline === null) return null;
  const left = Math.max(0, Math.ceil((deadline - (now - offset)) / 1000));
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="alertdialog" aria-live="assertive">
      <div className="modal center">
        <Icon name="wifiOff" size={48} />
        <h3>{t.connection.lost}</h3>
        <div className="spinner" />
        <p>{t.connection.reconnecting(left)}</p>
      </div>
    </motion.div>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((x) => (
          <motion.div key={x.id} className={`toast toast-${x.kind}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
            <Icon name={x.kind === 'info' ? 'sparkle' : 'alert'} size={16} /> {x.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Reactions() {
  const reactions = useStore((s) => s.reactions);
  const view = useStore((s) => s.view);
  const players = view?.players ?? [];
  const recent = reactions.filter((r) => Date.now() - r.at < 3000);
  return (
    <div className="reaction-layer" aria-hidden="true">
      <AnimatePresence>
        {recent.map((r, i) => (
          <motion.div
            key={r.id}
            className="reaction-float"
            style={{ left: `${10 + ((i * 17) % 80)}%` }}
            initial={{ opacity: 0, y: 40, scale: 0.6 }}
            animate={{ opacity: 1, y: -140, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6 }}
          >
            <span className="emoji">{r.emoji}</span>
            <small>{players.find((p) => p.id === r.playerId)?.name}</small>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Fängt unerwartete Darstellungsfehler ab, statt die ganze App zu leeren. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen center">
        <div className="modal center">
          <Icon name="alert" size={40} />
          <h3>Unerwarteter Anzeigefehler</h3>
          <p className="muted">Die Verbindung zum Raum bleibt bestehen.</p>
          <button className="btn btn-primary btn-md" onClick={() => this.setState({ failed: false })}>
            Erneut anzeigen
          </button>
        </div>
      </div>
    );
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

function AppInner() {
  useBoot();
  useReducedMotion();
  const settings = useStore((s) => s.settings);
  const screen = useStore((s) => s.screen);
  const view = useStore((s) => s.view);
  const session = useStore((s) => s.session);
  const reduced = useStore((s) => s.reducedMotion);
  // Reaktionen regelmäßig ausblenden
  useServerNow(1000);

  if (!settings) return <div className="app-root boot" />;

  let key: string = screen;
  let content: React.ReactNode;
  const me = view?.players.find((p) => p.id === view.youId);
  if (session && view && !(screen === 'settings' && view.phase === 'LOBBY')) {
    if (me?.waiting) {
      key = 'waiting';
      content = <WaitingScreen view={view} />;
    } else if (view.phase === 'LOBBY') {
      key = 'lobby';
      content = <Lobby view={view} />;
    } else if ((view.phase === 'PREPARING' || view.phase === 'COUNTDOWN' || view.phase === 'PLAYING_AND_VOTING') && view.round) {
      key = `round`;
      content = <RoundScreen view={view} />;
    } else if (view.phase === 'REVEAL' && view.reveal) {
      key = `reveal-${view.reveal.roundId}`;
      content = <RevealScreen view={view} />;
    } else if (view.phase === 'SCOREBOARD') {
      key = `score-${view.reveal?.roundId ?? ''}`;
      content = <ScoreboardScreen view={view} />;
    } else if (view.phase === 'RESULTS' && view.results) {
      key = 'results';
      content = <ResultsScreen view={view} />;
    } else {
      key = 'loading';
      content = (
        <div className="screen center">
          <div className="spinner" />
        </div>
      );
    }
  } else if (session && !view) {
    key = 'loading';
    content = (
      <div className="screen center">
        <div className="spinner" />
      </div>
    );
  } else {
    content =
      screen === 'intro' ? <Intro /> : screen === 'create' ? <CreateRoom /> : screen === 'join' ? <JoinRoom /> : screen === 'settings' ? <Settings /> : <MainMenu />;
  }

  const mood = !view ? 'menu' : view.phase === 'LOBBY' ? 'lobby' : view.phase === 'RESULTS' ? 'finale' : view.phase === 'REVEAL' ? 'reveal' : 'round';

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <div className={`app-root mood-${mood}`}>
        <Background mood={mood} enabled={!reduced && settings.display.effects === 'high'} />
        <AnimatePresence mode="wait">
          <motion.div
            key={key}
            className="screen-wrap"
            initial={{ opacity: 0, y: reduced ? 0 : 14, scale: reduced ? 1 : 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduced ? 0 : -10 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {content}
          </motion.div>
        </AnimatePresence>
        <Reactions />
        <Toasts />
        <AnimatePresence>
          <ReconnectOverlay />
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
