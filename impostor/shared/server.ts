/**
 * Zentrale Serverkonfiguration für alle Clients (Windows-App und Browser).
 *
 * Der produktive Spielserver liefert unter derselben Adresse den Web-Client aus
 * (`/`), den WebSocket-Endpunkt (`/ws`) und einen Healthcheck (`/healthz`).
 */
export const PRODUCTION_SERVER = 'https://imposter-hx0a.onrender.com';

export const WS_PATH = '/ws';

export interface ServerEndpoint {
  /** Öffentliche HTTP(S)-Basisadresse, z. B. für Einladungslinks */
  httpBase: string;
  /** WebSocket-Adresse des Spielservers */
  wsUrl: string;
}

export type EndpointSource = 'override' | 'desktop' | 'build' | 'origin' | 'production';

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOST.test(hostname);
}

/**
 * Macht aus einer beliebigen Eingabe eine gültige Serveradresse.
 * Akzeptiert z. B. „imposter-hx0a.onrender.com", „https://…/", „wss://…/ws",
 * „…/ws/ws" oder „localhost:8787". Liefert null für leere oder ungültige Werte
 * (z. B. file:-Pfade oder andere Protokolle).
 */
export function parseServerAddress(raw: unknown): ServerEndpoint | null {
  if (typeof raw !== 'string') return null;
  let input = raw.trim();
  if (!input) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    const host = input.split(/[/?#]/)[0].replace(/:\d+$/, '');
    input = `${isLocalHost(host) ? 'http' : 'https'}://${input}`;
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const scheme = url.protocol.toLowerCase();
  const secure = scheme === 'https:' || scheme === 'wss:';
  if (!secure && scheme !== 'http:' && scheme !== 'ws:') return null;
  if (!url.hostname) return null;
  // Pfad bereinigen: abschließende Schrägstriche und (mehrfache) „/ws" entfernen.
  let path = url.pathname.replace(/\/+$/, '');
  while (/\/ws$/i.test(path)) path = path.replace(/\/ws$/i, '').replace(/\/+$/, '');
  const host = url.host;
  return {
    httpBase: `${secure ? 'https' : 'http'}://${host}${path}`,
    wsUrl: `${secure ? 'wss' : 'ws'}://${host}${path}${WS_PATH}`,
  };
}

export interface ResolveInput {
  /** Bewusst gesetzter Entwickler-Override (Einstellungen → Erweitert) */
  override?: string | null;
  /** Nur Desktop-App: Adresse aus der Umgebung (IMPOSTOR_SERVER_URL) */
  desktopDefault?: string | null;
  isDesktop: boolean;
  /** Beim Build eingebrannte Adresse (IMPOSTOR_SERVER_URL beim Build) */
  buildDefault?: string | null;
  /** Adresse, unter der der Browser-Client geladen wurde */
  pageOrigin?: string | null;
  pageProtocol?: string | null;
}

/**
 * Bestimmt den Spielserver. Reihenfolge:
 *  1. gültiger Entwickler-Override
 *  2. Desktop-App: Umgebungsvariable, sonst Build-Standard, sonst Produktionsserver
 *  3. Browser: der Server, der die Seite ausgeliefert hat (gleicher Ursprung)
 *  4. sonst Build-Standard bzw. Produktionsserver
 * Lokale Entwicklungsadressen werden nie stillschweigend als Fallback verwendet.
 */
export function resolveServer(input: ResolveInput): { endpoint: ServerEndpoint; source: EndpointSource } {
  const override = parseServerAddress(input.override);
  if (override) return { endpoint: override, source: 'override' };
  const production = parseServerAddress(PRODUCTION_SERVER)!;
  const build = parseServerAddress(input.buildDefault);
  if (input.isDesktop) {
    const desktop = parseServerAddress(input.desktopDefault);
    if (desktop) return { endpoint: desktop, source: 'desktop' };
    if (build) return { endpoint: build, source: 'build' };
    return { endpoint: production, source: 'production' };
  }
  if ((input.pageProtocol === 'http:' || input.pageProtocol === 'https:') && input.pageOrigin) {
    const origin = parseServerAddress(input.pageOrigin);
    if (origin) return { endpoint: origin, source: 'origin' };
  }
  if (build) return { endpoint: build, source: 'build' };
  return { endpoint: production, source: 'production' };
}

export function inviteLink(endpoint: ServerEndpoint, code: string): string {
  return `${endpoint.httpBase}/?lobby=${encodeURIComponent(code)}`;
}

/** Wartezeiten zwischen Verbindungsversuchen (Render-Kaltstart kann ~1 Minute dauern). */
export const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 20000, 30000, 30000];

/** Nach so vielen Fehlversuchen in Folge gilt der Server als „momentan nicht erreichbar". */
export const MAX_AUTO_ATTEMPTS = RECONNECT_DELAYS_MS.length + 1;

/** Zeit, die ein einzelner Verbindungsaufbau dauern darf (Kaltstart des Servers). */
export const CONNECT_TIMEOUT_MS = 60_000;

export function reconnectDelay(failures: number): number {
  return RECONNECT_DELAYS_MS[Math.min(Math.max(failures - 1, 0), RECONNECT_DELAYS_MS.length - 1)];
}
