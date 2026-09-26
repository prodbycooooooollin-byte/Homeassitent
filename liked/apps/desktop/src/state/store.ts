import { create } from 'zustand';
import type { Reaction, RoomMode, RoomView } from '@liked/protocol';
import type { AppSettings, TikTokOverview, UpdateState } from '../shared/ipc-types';

export type Screen = 'intro' | 'menu' | 'create' | 'join' | 'settings';
export type SettingsTab = 'profile' | 'tiktok' | 'display' | 'audio' | 'network' | 'about';
export type ConnState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface Session {
  serverUrl: string;
  code: string;
  token: string;
  playerId: string;
  salt: string;
  mode: RoomMode;
}

export interface LocalVote {
  roundId: string;
  targetId: string;
  voteId: string;
  status: 'sending' | 'retrying' | 'confirmed' | 'late';
}

export interface Toast {
  id: string;
  text: string;
  kind: 'info' | 'warn' | 'error';
}

interface State {
  settings: AppSettings | null;
  tiktok: TikTokOverview | null;
  update: UpdateState;
  screen: Screen;
  settingsTab: SettingsTab;
  conn: ConnState;
  reconnectDeadline: number | null;
  session: Session | null;
  view: RoomView | null;
  clockOffset: number;
  rtt: number;
  vote: LocalVote | null;
  toasts: Toast[];
  reactions: (Reaction & { at: number })[];
  reducedMotion: boolean;
  prefillCode: string;
  poolError: string | null;
}

export const useStore = create<State>(() => ({
  settings: null,
  tiktok: null,
  update: { kind: 'idle' },
  screen: 'menu',
  settingsTab: 'profile',
  conn: 'idle',
  reconnectDeadline: null,
  session: null,
  view: null,
  clockOffset: 0,
  rtt: 0,
  vote: null,
  toasts: [],
  reactions: [],
  reducedMotion: false,
  prefillCode: '',
  poolError: null
}));

export const set = useStore.setState;
export const get = useStore.getState;

let toastSeq = 0;
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 5000): void {
  const id = `t${++toastSeq}`;
  set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
  window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

/** Serverzeit (ms) nach Uhrenabgleich. */
export function serverNow(): number {
  return Date.now() + get().clockOffset;
}
