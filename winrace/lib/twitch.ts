/**
 * Serverseitiger Twitch-Helix-Client.
 *
 * Wichtig: Client-ID/Secret und der App-Access-Token verlassen den Server
 * niemals – Client-Komponenten bekommen ausschließlich die von hier
 * abgeleiteten, bereits aufbereiteten Live-Status-Daten (siehe
 * app/api/twitch/streams/route.ts).
 */

const TWITCH_OAUTH_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_API_BASE = "https://api.twitch.tv/helix";

export function isTwitchConfigured(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

let appToken: { token: string; expiresAt: number } | null = null;

async function getAppAccessToken(): Promise<string> {
  if (!isTwitchConfigured()) {
    throw new Error("Twitch ist nicht konfiguriert (TWITCH_CLIENT_ID/SECRET fehlen).");
  }
  if (appToken && appToken.expiresAt - Date.now() > 60_000) {
    return appToken.token;
  }

  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID!,
    client_secret: process.env.TWITCH_CLIENT_SECRET!,
    grant_type: "client_credentials",
  });

  const res = await fetch(`${TWITCH_OAUTH_URL}?${params.toString()}`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Twitch App-Token konnte nicht geholt werden (${res.status})`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  appToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return appToken.token;
}

async function helixFetch(path: string): Promise<any> {
  const token = await getAppAccessToken();
  const res = await fetch(`${TWITCH_API_BASE}${path}`, {
    headers: {
      "Client-Id": process.env.TWITCH_CLIENT_ID!,
      Authorization: `Bearer ${token}`,
    },
    // Helix-Antworten ändern sich sekündlich – nie cachen lassen.
    cache: "no-store",
  });
  if (res.status === 401) {
    // Token abgelaufen/ungültig -> einmal neu holen und retryen.
    appToken = null;
    const retryToken = await getAppAccessToken();
    const retryRes = await fetch(`${TWITCH_API_BASE}${path}`, {
      headers: { "Client-Id": process.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${retryToken}` },
      cache: "no-store",
    });
    if (!retryRes.ok) throw new Error(`Twitch Helix Fehler ${retryRes.status}`);
    return retryRes.json();
  }
  if (!res.ok) throw new Error(`Twitch Helix Fehler ${res.status}`);
  return res.json();
}

export interface TwitchUserInfo {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
}

/** Prüft, ob ein Twitch-Kanalname existiert, und liefert Basisdaten dazu. */
export async function lookupTwitchUser(login: string): Promise<TwitchUserInfo | null> {
  const normalized = normalizeTwitchLogin(login);
  if (!normalized) return null;
  const data = await helixFetch(`/users?login=${encodeURIComponent(normalized)}`);
  const first = data.data?.[0];
  if (!first) return null;
  return {
    id: first.id,
    login: first.login,
    displayName: first.display_name,
    profileImageUrl: first.profile_image_url,
  };
}

export interface TwitchStreamInfo {
  login: string;
  isLive: boolean;
  title?: string;
  gameName?: string;
  viewerCount?: number;
  thumbnailUrl?: string;
  startedAt?: string;
}

interface CacheEntry {
  data: Map<string, TwitchStreamInfo>;
  expiresAt: number;
}
let streamCache: CacheEntry | null = null;
const STREAM_CACHE_TTL_MS = 20_000;

/** Live-Status für bis zu 100 Kanäle, mit kurzem In-Memory-Cache gegen Rate-Limits. */
export async function getLiveStreams(logins: string[]): Promise<Map<string, TwitchStreamInfo>> {
  const normalized = Array.from(new Set(logins.map(normalizeTwitchLogin).filter(Boolean))) as string[];
  if (normalized.length === 0) return new Map();

  const now = Date.now();
  if (streamCache && streamCache.expiresAt > now) {
    const cachedAll = normalized.every((l) => streamCache!.data.has(l));
    if (cachedAll) return streamCache.data;
  }

  const query = normalized.map((l) => `user_login=${encodeURIComponent(l)}`).join("&");
  const data = await helixFetch(`/streams?${query}&first=100`);
  const liveByLogin = new Map<string, any>();
  for (const s of data.data ?? []) {
    liveByLogin.set(s.user_login.toLowerCase(), s);
  }

  const result = new Map<string, TwitchStreamInfo>();
  for (const login of normalized) {
    const s = liveByLogin.get(login);
    result.set(
      login,
      s
        ? {
            login,
            isLive: true,
            title: s.title,
            gameName: s.game_name,
            viewerCount: s.viewer_count,
            thumbnailUrl: (s.thumbnail_url as string)?.replace("{width}", "440").replace("{height}", "248"),
            startedAt: s.started_at,
          }
        : { login, isLive: false }
    );
  }
  streamCache = { data: result, expiresAt: now + STREAM_CACHE_TTL_MS };
  return result;
}

/** Erlaubt sowohl reine Nutzernamen als auch vollständige twitch.tv-URLs. */
export function normalizeTwitchLogin(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim();
  if (!value) return null;
  try {
    if (value.includes("twitch.tv")) {
      const url = new URL(value.startsWith("http") ? value : `https://${value}`);
      value = url.pathname.split("/").filter(Boolean)[0] ?? "";
    }
  } catch {
    // Kein gültiges URL-Format -> als Klartext-Login weiterverwenden.
  }
  value = value.replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_]{2,25}$/.test(value) ? value : null;
}
