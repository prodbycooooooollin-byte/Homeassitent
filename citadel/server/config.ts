// Server-Konfiguration ausschließlich aus Umgebungsvariablen. Geheimnisse bleiben serverseitig.

export interface ServerConfig {
  port: number;
  host: string;
  dbPath: string;
  userAgent: string;
  adminToken: string | null;
  corsOrigins: string[];
  anthropicKey: boolean;
  aiModel: string;
  aiDailyBudgetUsd: number;
  braveKey: string | null;
  youtubeKey: string | null;
  githubToken: string | null;
  settingsIntervalHours: number;
  discoveryIntervalHours: number;
  maxFetchBytes: number;
  demo: boolean;
  /** Nur für Tests: erlaubt private Adressen (lokaler Fixture-Server). Niemals in Produktion setzen. */
  allowPrivateNetworkForTests: boolean;
}

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: num(env.CITADEL_PORT, 8787),
    host: env.CITADEL_HOST || '127.0.0.1',
    dbPath: env.CITADEL_DB || 'server/data/citadel.sqlite',
    userAgent: env.CITADEL_USER_AGENT || 'CITADEL-Research/0.1 (+https://github.com/prodbycooooooollin-byte/Homeassitent)',
    adminToken: env.CITADEL_ADMIN_TOKEN || null,
    corsOrigins: (env.CITADEL_CORS_ORIGINS || 'tauri://localhost,http://tauri.localhost,https://tauri.localhost,http://localhost:5173').split(',').map((s) => s.trim()),
    anthropicKey: Boolean(env.ANTHROPIC_API_KEY),
    aiModel: env.CITADEL_AI_MODEL || 'claude-opus-5-5',
    aiDailyBudgetUsd: num(env.CITADEL_AI_DAILY_BUDGET_USD, 2),
    braveKey: env.BRAVE_SEARCH_API_KEY || null,
    youtubeKey: env.YOUTUBE_API_KEY || null,
    githubToken: env.GITHUB_TOKEN || null,
    settingsIntervalHours: num(env.CITADEL_SETTINGS_INTERVAL_HOURS, 18),
    discoveryIntervalHours: num(env.CITADEL_DISCOVERY_INTERVAL_HOURS, 72),
    maxFetchBytes: num(env.CITADEL_MAX_FETCH_BYTES, 2_000_000),
    demo: env.CITADEL_DEMO === '1',
    allowPrivateNetworkForTests: env.CITADEL_TEST_ALLOW_PRIVATE === '1',
  };
}
