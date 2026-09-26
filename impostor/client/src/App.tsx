import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ClientCommand } from '../../shared/protocol.ts';
import { play, sound } from './audio/sound.ts';
import { connection, useConnection, type CmdResult } from './net/connection.ts';
import { Home } from './screens/Home.tsx';
import { LobbyScreen } from './screens/LobbyScreen.tsx';
import { Onboarding } from './screens/Onboarding.tsx';
import { ProfileSetup } from './screens/ProfileSetup.tsx';
import { ResultScreen } from './screens/ResultScreen.tsx';
import { RulesDialog } from './screens/RulesDialog.tsx';
import { SettingsDialog } from './screens/SettingsDialog.tsx';
import { MatchScreen } from './match/MatchScreen.tsx';
import { useProfile, useSettings } from './state/storage.ts';
import { Toasts, toast, useReducedMotionPref } from './ui/common.tsx';
import { ConnectionBanner } from './ui/ConnectionStatus.tsx';

interface UI {
  openRules(): void;
  openSettings(): void;
  reduced: boolean;
}
const UIContext = createContext<UI>({ openRules() {}, openSettings() {}, reduced: false });
export const useUI = () => useContext(UIContext);

/** Sendet ein Kommando und zeigt Fehler verständlich an. */
export function useCmd() {
  return useCallback(async (cmd: ClientCommand, opts: { quiet?: boolean } = {}): Promise<CmdResult> => {
    const r = await connection.send(cmd);
    if (!r.ok && !opts.quiet) {
      toast(r.message, 'error');
      play('error');
    }
    return r;
  }, []);
}

export function App() {
  const profile = useProfile();
  const settings = useSettings();
  const conn = useConnection();
  const reduced = useReducedMotionPref(settings.reducedMotion);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dismissedResult, setDismissedResult] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduced);
  }, [reduced]);

  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    const off = connection.onNotice((kind, message) => {
      toast(message, kind === 'server_restart' || kind === 'kicked' || kind === 'lobby_lost' ? 'error' : 'info', 6000);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setRulesOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('keydown', onKey);
      off();
    };
  }, []);

  useEffect(() => {
    if (profile.set) connection.start();
  }, [profile.set]);

  const ui = useMemo<UI>(
    () => ({ openRules: () => setRulesOpen(true), openSettings: () => setSettingsOpen(true), reduced }),
    [reduced],
  );

  const view = conn.view;
  const me = view?.me.id;
  const result = view?.lastResult ?? null;
  const showResult =
    !!view && !!result && !!me && view.lobby.phase === 'lobby' && result.seatOrder.includes(me) && dismissedResult !== result.matchId;

  let screen: { key: string; node: React.ReactNode };
  if (!profile.set) screen = { key: 'profile', node: <ProfileSetup /> };
  else if (!settings.onboardingDone) screen = { key: 'onboarding', node: <Onboarding /> };
  else if (!view) screen = { key: 'home', node: <Home /> };
  else if (showResult) {
    screen = {
      key: `result-${result!.matchId}`,
      node: <ResultScreen view={view} result={result!} onDone={() => setDismissedResult(result!.matchId)} />,
    };
  } else if (view.match) screen = { key: `match-${view.match.id}`, node: <MatchScreen view={view} /> };
  else screen = { key: `lobby-${view.lobby.code}`, node: <LobbyScreen view={view} /> };

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <UIContext.Provider value={ui}>
        <div className="app">
          <div className="room-light" aria-hidden="true" />
          <AnimatePresence mode="wait">
            <motion.div
              key={screen.key}
              className="screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            >
              {screen.node}
            </motion.div>
          </AnimatePresence>
          <ConnectionBanner show={profile.set && conn.everOnline} />
          <Toasts />
          <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
          <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
      </UIContext.Provider>
    </MotionConfig>
  );
}
