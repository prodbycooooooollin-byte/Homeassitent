import { useSyncExternalStore } from 'react';
import {
  PROTOCOL_VERSION,
  type ClientCommand,
  type ClientMessage,
  type ClientView,
  type ErrorCode,
  type ServerMessage,
} from '../../../shared/protocol.ts';
import {
  CONNECT_TIMEOUT_MS,
  MAX_AUTO_ATTEMPTS,
  reconnectDelay,
  resolveServer,
  type EndpointSource,
  type ServerEndpoint,
} from '../../../shared/server.ts';
import { profileStore, settingsStore, tokenStorage } from '../state/storage.ts';

/**
 * Verbindungszustände:
 *  - connecting:   erster Verbindungsaufbau (Server startet ggf. gerade)
 *  - online:       verbunden
 *  - reconnecting: Verbindung unterbrochen – erneuter Versuch läuft
 *  - unreachable:  nach mehreren Versuchen momentan nicht erreichbar (manuell erneut versuchen)
 */
export type ConnStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'unreachable';

export interface ConnState {
  status: ConnStatus;
  view: ClientView | null;
  playerId: string | null;
  webClient: boolean;
  /** Serverzeit − lokale Zeit */
  offset: number;
  /** Anzahl fehlgeschlagener Verbindungsversuche in Folge */
  failures: number;
  endpoint: ServerEndpoint;
  endpointSource: EndpointSource;
  /** Zeitpunkt (lokal), ab dem der aktuelle Verbindungsversuch läuft */
  attemptStartedAt: number;
  /** Nächster automatischer Versuch (lokal) oder null */
  nextRetryAt: number | null;
  /** War diese Sitzung schon einmal verbunden? */
  everOnline: boolean;
}

export type CmdResult = { ok: true } | { ok: false; code: ErrorCode | 'timeout'; message: string };

type Listener = () => void;
type NoticeListener = (kind: string, message: string) => void;

/** Ermittelt den Spielserver aus der zentralen Konfiguration (shared/server.ts). */
export function currentServer() {
  let pageOrigin: string | null = null;
  let pageProtocol: string | null = null;
  try {
    pageOrigin = location.origin;
    pageProtocol = location.protocol;
  } catch {
    /* kein location (Tests) */
  }
  return resolveServer({
    override: settingsStore.get().serverOverride,
    isDesktop: !!window.impostorDesktop?.isDesktop,
    desktopDefault: window.impostorDesktop?.defaultServer ?? null,
    buildDefault: __DEFAULT_SERVER__,
    pageOrigin,
    pageProtocol,
  });
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
    ...(() => {
      const r = currentServer();
      return { endpoint: r.endpoint, endpointSource: r.source };
    })(),
    attemptStartedAt: 0,
    nextRetryAt: null,
    everOnline: false,
  };
  private connectTimer: number | null = null;
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
    if (!this.stopped) return;
    this.stopped = false;
    window.addEventListener('online', () => {
      if (this.state.status === 'unreachable' || this.state.status === 'reconnecting') this.retryNow();
    });
    this.open();
  }

  /** Sofort neu versuchen (Button „Erneut versuchen", Netzwerk wieder da, geänderter Override). */
  retryNow() {
    this.stopped = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.patch({ failures: 0, nextRetryAt: null });
    this.open();
  }

  /** Neu verbinden mit frisch ermittelter Serveradresse (z. B. nach Änderung unter „Erweitert"). */
  restart() {
    const old = this.ws;
    this.ws = null;
    old?.close();
    this.patch({ view: null });
    this.retryNow();
  }

  private clearTimers() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private open() {
    if (this.stopped) return;
    // Keine parallelen oder doppelten Verbindungen.
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;
    const { endpoint, source } = currentServer();
    this.patch({
      status: this.state.everOnline ? 'reconnecting' : 'connecting',
      endpoint,
      endpointSource: source,
      attemptStartedAt: Date.now(),
      nextRetryAt: null,
    });
    let ws: WebSocket;
    try {
      ws = new WebSocket(endpoint.wsUrl);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    this.clearTimers();
    // Kaltstart des Servers abwarten, aber hängende Versuche beenden.
    this.connectTimer = window.setTimeout(() => {
      if (this.ws === ws && ws.readyState !== WebSocket.OPEN) ws.close();
    }, CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      this.clearTimers();
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
      if (this.ws !== ws) return;
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
      this.clearTimers();
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
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (failures >= MAX_AUTO_ATTEMPTS) {
      // Begrenzte Wiederholungen: danach wartet der Client auf „Erneut versuchen".
      this.patch({ status: 'unreachable', failures, nextRetryAt: null });
      return;
    }
    const delay = reconnectDelay(failures);
    this.patch({ status: this.state.everOnline ? 'reconnecting' : 'connecting', failures, nextRetryAt: Date.now() + delay });
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
          nextRetryAt: null,
          everOnline: true,
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
