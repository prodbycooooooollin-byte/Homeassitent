import { useSyncExternalStore } from 'react';
import {
  PROTOCOL_VERSION,
  type ClientCommand,
  type ClientMessage,
  type ClientView,
  type ErrorCode,
  type ServerMessage,
} from '../../../shared/protocol.ts';
import { profileStore, settingsStore, tokenStorage } from '../state/storage.ts';

export type ConnStatus = 'idle' | 'connecting' | 'online' | 'reconnecting';

export interface ConnState {
  status: ConnStatus;
  view: ClientView | null;
  playerId: string | null;
  webClient: boolean;
  /** Serverzeit − lokale Zeit */
  offset: number;
  /** Anzahl fehlgeschlagener Verbindungsversuche in Folge */
  failures: number;
  serverUrl: string;
}

export type CmdResult = { ok: true } | { ok: false; code: ErrorCode | 'timeout'; message: string };

type Listener = () => void;
type NoticeListener = (kind: string, message: string) => void;

/** Ermittelt die WebSocket-Adresse des Spielservers. */
export function resolveServerUrl(): string {
  const override = settingsStore.get().serverUrl.trim();
  if (override) return toWsUrl(override);
  if (window.impostorDesktop?.defaultServer) return toWsUrl(window.impostorDesktop.defaultServer);
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }
  return toWsUrl(__DEFAULT_SERVER__ || 'ws://localhost:8787/ws');
}

export function toWsUrl(raw: string): string {
  let u = raw.trim();
  if (!/^[a-z]+:\/\//i.test(u)) u = `wss://${u}`;
  u = u.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  try {
    const url = new URL(u);
    if (url.pathname === '/' || url.pathname === '') url.pathname = '/ws';
    return url.toString();
  } catch {
    return u;
  }
}

let actionSeq = 0;
function newActionId(): string {
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  return `${Date.now().toString(36)}-${(++actionSeq).toString(36)}-${rnd[0].toString(36)}${rnd[1].toString(36)}`;
}

/**
 * Verbindung zum Spielserver. Stellt Verbindungen automatisch wieder her,
 * sendet unbestätigte Kommandos mit derselben Aktions-ID erneut (der Server
 * verarbeitet sie idempotent) und hält eine Uhrzeitabweichung für Timer.
 */
class Connection {
  private ws: WebSocket | null = null;
  private state: ConnState = {
    status: 'idle',
    view: null,
    playerId: null,
    webClient: false,
    offset: 0,
    failures: 0,
    serverUrl: '',
  };
  private listeners = new Set<Listener>();
  private noticeListeners = new Set<NoticeListener>();
  private pending = new Map<string, { cmd: ClientCommand; resolve: (r: CmdResult) => void; timer: number }>();
  private retryTimer: number | null = null;
  private pingTimer: number | null = null;
  private samples: { rtt: number; offset: number }[] = [];
  private hadLobby = false;
  private stopped = true;

  get = () => this.state;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  onNotice(l: NoticeListener) {
    this.noticeListeners.add(l);
    return () => {
      this.noticeListeners.delete(l);
    };
  }

  private emitNotice(kind: string, message: string) {
    this.noticeListeners.forEach((l) => l(kind, message));
  }

  private patch(p: Partial<ConnState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  }

  /** Aktuelle Serverzeit (geschätzt). */
  serverNow(): number {
    return Date.now() + this.state.offset;
  }

  start() {
    this.stopped = false;
    this.open();
  }

  /** Neu verbinden, z. B. nach Änderung der Serveradresse. */
  restart() {
    this.ws?.close();
    this.ws = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.patch({ failures: 0, view: null });
    this.open();
  }

  private open() {
    if (this.stopped) return;
    const url = resolveServerUrl();
    this.patch({ status: this.state.status === 'online' || this.state.failures > 0 ? 'reconnecting' : 'connecting', serverUrl: url });
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      const profile = profileStore.get();
      const hello: ClientMessage = {
        type: 'hello',
        token: tokenStorage.get(),
        profile: { name: profile.name || 'Gast', avatar: profile.avatar },
        protocol: PROTOCOL_VERSION,
      };
      ws.send(JSON.stringify(hello));
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.scheduleRetry();
    };
    ws.onerror = () => {
      /* onclose folgt */
    };
  }

  private scheduleRetry() {
    if (this.stopped) return;
    const failures = this.state.failures + 1;
    this.patch({ status: 'reconnecting', failures });
    const delay = Math.min(5000, 400 * 2 ** Math.min(failures, 4));
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.open(), delay);
  }

  private onMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'welcome': {
        tokenStorage.set(msg.token);
        if (msg.sessionReset && this.hadLobby) {
          this.emitNotice(
            'server_restart',
            'Der Server wurde neu gestartet. Eine laufende Partie wurde ohne Wertung beendet.',
          );
          this.hadLobby = false;
        }
        this.patch({
          status: 'online',
          playerId: msg.playerId,
          webClient: msg.webClient,
          failures: 0,
          offset: msg.serverNow - Date.now(),
        });
        this.samples = [];
        this.ping();
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = window.setInterval(() => this.ping(), 5000);
        // Unbestätigte Kommandos erneut senden (gleiche Aktions-ID → keine Doppelwirkung).
        for (const [actionId, p] of this.pending) this.raw({ type: 'cmd', actionId, cmd: p.cmd });
        break;
      }
      case 'pong': {
        const now = Date.now();
        const rtt = now - msg.clientTime;
        if (rtt < 0 || rtt > 10_000) return;
        this.samples.push({ rtt, offset: msg.serverNow - (msg.clientTime + rtt / 2) });
        if (this.samples.length > 8) this.samples.shift();
        const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
        this.patch({ offset: best.offset });
        break;
      }
      case 'state': {
        const cur = this.state.view;
        const next = msg.view;
        if (next && cur && next.lobby.code === cur.lobby.code && next.rev < cur.rev) return;
        if (!next && this.hadLobby && !this.leaving) {
          this.emitNotice('lobby_lost', 'Du warst zu lange getrennt und bist nicht mehr in der Lobby.');
        }
        this.hadLobby = next !== null;
        this.leaving = false;
        this.patch({ view: next });
        break;
      }
      case 'ack': {
        const p = this.pending.get(msg.actionId);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(msg.actionId);
        p.resolve(msg.ok ? { ok: true } : { ok: false, code: msg.code, message: msg.message });
        break;
      }
      case 'notice':
        if (msg.kind === 'kicked') this.hadLobby = false;
        this.emitNotice(msg.kind, msg.message);
        if (msg.kind === 'replaced') this.stopped = true;
        break;
    }
  }

  private leaving = false;

  private ping() {
    this.raw({ type: 'ping', clientTime: Date.now() });
  }

  private raw(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  send(cmd: ClientCommand): Promise<CmdResult> {
    const actionId = newActionId();
    if (cmd.t === 'leaveLobby') {
      this.leaving = true;
      this.hadLobby = false;
    }
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(actionId);
        resolve({ ok: false, code: 'timeout', message: 'Keine Antwort vom Server. Verbindung wird wiederhergestellt.' });
      }, 12_000);
      this.pending.set(actionId, { cmd, resolve, timer });
      this.raw({ type: 'cmd', actionId, cmd });
    });
  }
}

export const connection = new Connection();

export function useConnection(): ConnState {
  return useSyncExternalStore(connection.subscribe, connection.get);
}
