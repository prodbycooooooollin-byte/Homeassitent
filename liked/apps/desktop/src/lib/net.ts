import { io, type Socket } from 'socket.io-client';
import {
  PROTOCOL_VERSION,
  RECONNECT_WINDOW_MS,
  type Ack,
  type JoinResult,
  type Phase,
  type Reaction,
  type RoomMode,
  type RoomView,
  type TimeSyncResult,
  type VoteResult
} from '@liked/protocol';
import { get, set, toast } from '../state/store';
import { api } from './api';
import { sound } from './sound';
import { t } from '../i18n/de';

/**
 * Netzwerk-Client: eine Socket.IO-Verbindung zum Spielserver, Uhrenabgleich,
 * Wiederverbindung mit separatem Token, idempotente Stimmen und das automatische
 * Übermitteln der eigenen Clip-Kandidaten in der Lobby.
 */
let socket: Socket | null = null;
let socketUrl = '';
let syncTimer: number | null = null;
let reconnectTimer: number | null = null;
let lastPhaseKey = '';
let poolEpoch = '';
let poolInFlight = false;
let lobbyEntry = 0;
const seenNotices = new Set<string>();

const errText = (code?: string) => t.errors[code ?? 'network'] ?? t.errors.network!;

function emit<T extends object>(event: string, payload: unknown = {}, timeoutMs = 6000): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (!socket?.connected) return resolve({ ok: false, error: 'not_in_room' });
    socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: Ack<T>) => {
      if (err) resolve({ ok: false, error: 'network' as never });
      else resolve(res);
    });
  });
}

async function syncClock(samples = 5): Promise<void> {
  let best: { rtt: number; offset: number } | null = null;
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    const res = await emit<TimeSyncResult>('timeSync', { t0 }, 3000);
    const t1 = Date.now();
    if (!res.ok) continue;
    const rtt = t1 - t0;
    const offset = res.serverTime - (t0 + rtt / 2);
    if (!best || rtt < best.rtt) best = { rtt, offset };
  }
  if (best) set({ clockOffset: best.offset, rtt: best.rtt });
}

function ensureSocket(serverUrl: string): Socket {
  if (socket && socketUrl === serverUrl) return socket;
  socket?.removeAllListeners();
  socket?.disconnect();
  socketUrl = serverUrl;
  set({ conn: 'connecting' });
  const s = io(serverUrl, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 2000,
    timeout: 8000
  });
  socket = s;
  s.on('connect', () => {
    void onConnected();
  });
  s.on('disconnect', () => {
    if (get().session) beginReconnectWindow();
    else set({ conn: 'idle' });
  });
  s.on('connect_error', () => {
    if (get().session) beginReconnectWindow();
    else set({ conn: 'failed' });
  });
  s.on('room:state', (v: RoomView) => onView(v));
  s.on('room:reaction', (r: Reaction) => {
    set((st) => ({ reactions: [...st.reactions.slice(-12), { ...r, at: Date.now() }] }));
  });
  s.on('room:kicked', () => {
    toast(t.connection.kicked, 'warn');
    void resetToMenu();
  });
  return s;
}

async function onConnected() {
  set({ conn: 'connected' });
  await syncClock();
  if (syncTimer) window.clearInterval(syncTimer);
  syncTimer = window.setInterval(() => void syncClock(3), 20_000);
  const sess = get().session;
  if (sess && get().reconnectDeadline !== null) {
    const res = await emit<JoinResult>('resumeRoom', { code: sess.code, token: sess.token });
    if (res.ok) {
      set({ reconnectDeadline: null });
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    } else {
      toast(t.connection.failed, 'error');
      await resetToMenu();
    }
  }
}

function beginReconnectWindow() {
  if (get().reconnectDeadline !== null) return;
  set({ conn: 'reconnecting', reconnectDeadline: Date.now() + RECONNECT_WINDOW_MS });
  if (reconnectTimer) window.clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(() => {
    if (get().conn !== 'connected' || get().reconnectDeadline !== null) {
      toast(t.connection.failed, 'error');
      void resetToMenu();
    }
  }, RECONNECT_WINDOW_MS + 1000);
}

export async function resetToMenu(): Promise<void> {
  set({ session: null, view: null, vote: null, reconnectDeadline: null, screen: 'menu', reactions: [] });
  poolEpoch = '';
  lastPhaseKey = '';
  sound.duck(false);
  await api.lastRoom.set(null);
}

/* ------------------------------------------------------------------ */
/* Raum erstellen / beitreten / verlassen                              */
/* ------------------------------------------------------------------ */

function profile() {
  const s = get().settings!;
  return { name: s.profile.name, avatar: s.profile.avatar, deviceId: s.profile.deviceId };
}

async function connectTo(serverUrl: string): Promise<boolean> {
  const s = ensureSocket(serverUrl);
  if (s.connected) return true;
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      s.off('connect', onOk);
      s.off('connect_error', onErr);
      window.clearTimeout(timer);
      resolve(ok);
    };
    const onOk = () => done(true);
    const onErr = () => done(false);
    const timer = window.setTimeout(() => done(false), 8000);
    s.once('connect', onOk);
    s.once('connect_error', onErr);
  });
}

async function enter(res: JoinResult & { mode: RoomMode }, serverUrl: string) {
  const session = { serverUrl, code: res.roomCode, token: res.token, playerId: res.playerId, salt: res.indexSalt, mode: res.mode };
  set({ session, screen: 'menu' });
  await api.lastRoom.set({ serverUrl, code: res.roomCode, token: res.token, at: Date.now() });
}

export async function createRoom(mode: RoomMode): Promise<string | null> {
  const serverUrl = get().settings!.serverUrl;
  if (!(await connectTo(serverUrl))) return t.connection.serverUnreachable;
  const res = await emit<JoinResult & { mode: RoomMode }>('createRoom', { profile: profile(), mode, protocolVersion: PROTOCOL_VERSION });
  if (!res.ok) return errText(res.error);
  await enter(res, serverUrl);
  return null;
}

export async function joinRoom(code: string): Promise<string | null> {
  const serverUrl = get().settings!.serverUrl;
  if (!(await connectTo(serverUrl))) return t.connection.serverUnreachable;
  const res = await emit<JoinResult & { mode: RoomMode }>('joinRoom', { code, profile: profile(), protocolVersion: PROTOCOL_VERSION });
  if (!res.ok) return errText(res.error);
  await enter(res, serverUrl);
  return null;
}

/** Nach einem App-Neustart innerhalb des Reconnect-Fensters in den Raum zurückkehren. */
export async function tryResumeLastRoom(): Promise<void> {
  const last = await api.lastRoom.get();
  if (!last || Date.now() - last.at > RECONNECT_WINDOW_MS) {
    if (last) await api.lastRoom.set(null);
    return;
  }
  if (!(await connectTo(last.serverUrl))) return;
  const res = await emit<JoinResult & { mode: RoomMode }>('resumeRoom', { code: last.code, token: last.token });
  if (res.ok) await enter(res, last.serverUrl);
  else await api.lastRoom.set(null);
}

export async function leaveRoom(): Promise<void> {
  await emit('leaveRoom');
  await resetToMenu();
}

export const actions = {
  settings: (patch: { clipsPerPerson?: number; answerSeconds?: number }) => emit('updateSettings', patch),
  ready: (ready: boolean) => emit('setReady', { ready }),
  mediaCheck: (ok: boolean) => emit('mediaCheck', { ok }),
  kick: (playerId: string) => emit('kick', { playerId }),
  start: () => emit('start'),
  react: (emoji: string) => emit('react', { emoji }),
  pause: (paused: boolean) => emit('hostPause', { paused }),
  rematch: () => emit('rematch'),
  toLobby: () => emit('toLobby'),
  playerStatus: (roundId: string, status: 'ready' | 'failed', reason?: 'unavailable' | 'timeout' | 'network' | 'unknown') =>
    emit('playerStatus', { roundId, status, reason }),
  playback: (roundId: string, kind: 'started' | 'buffering' | 'resumed' | 'error', position: number) =>
    emit('playback', { roundId, kind, position: Math.max(0, Math.min(3600, position || 0)) })
};

/* ------------------------------------------------------------------ */
/* Stimmen – genau ein verbindlicher Tipp                              */
/* ------------------------------------------------------------------ */

export async function castVote(targetId: string): Promise<void> {
  const v = get().view;
  const round = v?.round;
  if (!round || v.phase !== 'PLAYING_AND_VOTING' || round.you.role !== 'voter') return;
  if (round.you.vote) return;
  const existing = get().vote;
  if (existing && existing.roundId === round.roundId) return; // Zweiter Klick ändert nichts
  const voteId = crypto.randomUUID();
  set({ vote: { roundId: round.roundId, targetId, voteId, status: 'sending' } });
  sound.voteSent();
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await emit<VoteResult>('vote', { roundId: round.roundId, targetId, voteId }, 2500);
    const cur = get().vote;
    if (!cur || cur.voteId !== voteId) return;
    if (res.ok) {
      set({ vote: { ...cur, targetId: res.vote.targetId, status: 'confirmed' } });
      return;
    }
    if (res.error === 'too_late' || res.error === 'round_mismatch' || res.error === 'wrong_phase') {
      set({ vote: { ...cur, status: 'late' } });
      return;
    }
    if (res.error === 'invalid_target' || res.error === 'not_eligible') {
      set({ vote: null });
      return;
    }
    set({ vote: { ...cur, status: 'retrying' } });
    await new Promise((r) => window.setTimeout(r, 400 + attempt * 400));
  }
}

/* ------------------------------------------------------------------ */
/* Eingehende Zustände                                                 */
/* ------------------------------------------------------------------ */

function onView(v: RoomView) {
  const prev = get().view;
  if (prev && prev.roomId === v.roomId && v.version < prev.version) return; // veraltet
  // Serverbestätigte Stimme (z. B. nach Reconnect) übernehmen.
  const round = v.round;
  let vote = get().vote;
  if (round?.you.vote) vote = { roundId: round.roundId, ...round.you.vote, status: 'confirmed' };
  else if (vote && (!round || vote.roundId !== round.roundId) && v.phase !== 'REVEAL' && v.phase !== 'SCOREBOARD') vote = null;
  set({ view: v, vote });
  sideEffects(prev, v);
}

function sideEffects(prev: RoomView | null, v: RoomView) {
  // Hinweise genau einmal anzeigen.
  for (const n of v.notices) {
    if (seenNotices.has(n.key)) continue;
    seenNotices.add(n.key);
    if (prev === null) continue; // Beim (Wieder-)Eintritt keine alten Hinweise
    const text = t.notices[n.kind];
    toast(typeof text === 'function' ? text(n.param) : text, n.kind === 'round_voided' || n.kind === 'clip_replaced' ? 'warn' : 'info');
  }

  // Beitritt/Verlassen hörbar machen (nur Lobby).
  if (prev && prev.roomId === v.roomId && v.phase === 'LOBBY') {
    if (v.players.length > prev.players.length) sound.join();
    else if (v.players.length < prev.players.length) sound.leave();
    const readyNow = v.players.filter((p) => p.ready).length;
    const readyBefore = prev.players.filter((p) => p.ready).length;
    if (readyNow > readyBefore) sound.ready();
  }

  // Phasenwechsel: Sounds und Musik (genau einmal je Runde/Phase).
  const roundKey = v.round?.roundId ?? v.reveal?.roundId ?? '';
  const phaseKey = `${v.roomId}:${v.phase}:${roundKey}`;
  if (phaseKey !== lastPhaseKey) {
    lastPhaseKey = phaseKey;
    onPhase(v.phase, v);
  }

  // Eigene gespielte Clips merken (weniger Wiederholungen in späteren Partien).
  if (v.phase === 'REVEAL' && v.reveal && v.reveal.ownerId === v.youId) {
    sound.once(`played:${v.reveal.roundId}`, () => void api.tiktok.recordPlayed([v.reveal!.clip.videoId]));
  }

  // Lobby: Kandidaten automatisch übermitteln.
  if (v.phase === 'LOBBY') void maybeSubmitPool(v);
  else poolEpoch = '';
}

function onPhase(phase: Phase, v: RoomView) {
  const musicPhases: Phase[] = ['LOBBY', 'RESULTS', 'SCOREBOARD'];
  if (musicPhases.includes(phase)) {
    sound.duck(false);
    sound.startMusic();
  }
  if (phase === 'PLAYING_AND_VOTING' || phase === 'COUNTDOWN' || phase === 'PREPARING') sound.duck(true);
  if (phase === 'REVEAL') sound.duck(false);
  if (phase === 'LOBBY') lobbyEntry++;
  if (phase === 'RESULTS') sound.once(`finale:${v.roomId}:${v.version}`, () => sound.finale());
}

export async function maybeSubmitPool(v: RoomView | null = get().view, force = false): Promise<void> {
  const sess = get().session;
  if (!sess || !v || v.phase !== 'LOBBY' || poolInFlight) return;
  if (!v.players.some((p) => p.id === v.youId)) return;
  const epoch = `${v.roomId}:${lobbyEntry}:${v.settings.clipsPerPerson}`;
  if (!force && poolEpoch === epoch) return;
  poolEpoch = epoch;
  poolInFlight = true;
  try {
    const pool = await api.tiktok.buildPool(sess.mode, sess.salt);
    if ('error' in pool) {
      set({ poolError: pool.error });
      return;
    }
    set({ poolError: null });
    const res = await emit('submitPool', pool);
    if (!res.ok) toast(errText(res.error), 'warn');
  } finally {
    poolInFlight = false;
  }
}
