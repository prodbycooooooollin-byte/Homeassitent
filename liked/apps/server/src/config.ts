import { TIMINGS } from '@liked/protocol';

export type Timings = { -readonly [K in keyof typeof TIMINGS]: number };

export interface TikTokServerConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface ServerConfig {
  host: string;
  port: number;
  /** Öffentliche Basis-URL (für Beitrittslinks und OAuth-Redirect). */
  publicUrl: string;
  dataDir: string;
  maxRooms: number;
  /** Nur hinter einem vertrauenswürdigen Reverse Proxy aktivieren. */
  trustProxy: boolean;
  timings: Timings;
  reconnectWindowMs: number;
  tiktok: TikTokServerConfig | null;
  /** 32-Byte-Schlüssel (base64) zur Verschlüsselung gespeicherter TikTok-Tokens. */
  tokenEncryptionKey: Buffer | null;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Token-Buckets für Socket-Ereignisse (Kapazität, Nachfüllung pro Sekunde). */
  rateLimits: { perSocket: [number, number]; perEvent: [number, number]; joinPerIp: [number, number] };
  /** TikTok-Domain-/URL-Prefix-Verifizierung: Dateiname → Inhalt (öffentlich, kein Secret). */
  tiktokVerification: { file: string; content: string } | null;
  /** Warum keine Verifizierung aktiv ist (für /healthz, ohne Inhalte). */
  tiktokVerificationStatus: 'ok' | 'not_set' | 'missing_file' | 'missing_content' | 'invalid_file';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 8787);
  // Render setzt RENDER_EXTERNAL_URL automatisch (https://<name>.onrender.com).
  const publicUrl = (env.PUBLIC_URL ?? env.RENDER_EXTERNAL_URL ?? `http://localhost:${port}`).replace(/\/$/, '');
  const hasTikTok = !!(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET);
  const key = env.TOKEN_ENCRYPTION_KEY ? Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'base64') : null;
  if (key && key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY muss 32 Byte (base64) lang sein');
  if (hasTikTok && !key) throw new Error('TikTok ist konfiguriert, aber TOKEN_ENCRYPTION_KEY fehlt');
  return {
    host: env.HOST ?? '0.0.0.0',
    port,
    publicUrl,
    dataDir: env.DATA_DIR ?? './data',
    maxRooms: Number(env.MAX_ROOMS ?? 200),
    trustProxy: env.TRUST_PROXY === '1',
    // TIMINGS_SCALE nur für Tests/Entwicklung (z. B. 0.3 = schnellere Auflösung/Übergänge).
    timings: scaleTimings(Number(env.TIMINGS_SCALE ?? 1)),
    reconnectWindowMs: Number(env.RECONNECT_WINDOW_MS ?? 30_000),
    tiktok: hasTikTok
      ? {
          clientKey: env.TIKTOK_CLIENT_KEY!,
          clientSecret: env.TIKTOK_CLIENT_SECRET!,
          redirectUri: env.TIKTOK_REDIRECT_URI ?? `${publicUrl}/auth/tiktok/callback`,
          scopes: (env.TIKTOK_SCOPES ?? 'user.info.basic,portability.activity.ongoing').split(',').map((s) => s.trim())
        }
      : null,
    tokenEncryptionKey: key,
    logLevel: (env.LOG_LEVEL as ServerConfig['logLevel']) ?? 'info',
    // Eine echte Runde dauert ≥ 15 s; diese Limits bremsen nur Missbrauch.
    rateLimits: { perSocket: [80, 15], perEvent: [20, 4], joinPerIp: [10, 1 / 6] },
    ...parseTikTokVerification(env)
  };
}

function scaleTimings(scale: number): Timings {
  const f = Number.isFinite(scale) && scale > 0 && scale <= 1 ? scale : 1;
  const t = { ...TIMINGS } as Timings;
  // Nur Darstellungs-Phasen skalieren; Toleranzen und Fristen bleiben unverändert.
  t.revealMs = Math.round(t.revealMs * f);
  t.scoreboardMs = Math.round(t.scoreboardMs * f);
  t.countdownMs = Math.max(1000, Math.round(t.countdownMs * f));
  return t;
}

/**
 * Tolerantes Einlesen der TikTok-Verifizierung: akzeptiert auch eine eingefügte URL oder einen Pfad
 * als Dateinamen sowie Anführungszeichen/Leerzeichen um die Werte.
 */
export function parseTikTokVerification(env: NodeJS.ProcessEnv): Pick<ServerConfig, 'tiktokVerification' | 'tiktokVerificationStatus'> {
  const clean = (v?: string) => (v ?? '').trim().replace(/^["']|["']$/g, '').trim();
  const rawFile = clean(env.TIKTOK_VERIFY_FILE);
  const content = clean(env.TIKTOK_VERIFY_CONTENT);
  if (!rawFile && !content) return { tiktokVerification: null, tiktokVerificationStatus: 'not_set' };
  if (!rawFile) return { tiktokVerification: null, tiktokVerificationStatus: 'missing_file' };
  if (!content) return { tiktokVerification: null, tiktokVerificationStatus: 'missing_content' };
  const file = rawFile.split(/[\\/]/).pop()!.split('?')[0]!.trim();
  if (!/^[A-Za-z0-9_-]{4,100}\.txt$/.test(file)) return { tiktokVerification: null, tiktokVerificationStatus: 'invalid_file' };
  return { tiktokVerification: { file, content }, tiktokVerificationStatus: 'ok' };
}
