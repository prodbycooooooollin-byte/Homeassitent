import { normalizeHistory, normalizeMetadata } from "./normalize";
import { modeLabel } from "../modes";
import type { HistoryEntry, MatchDetails } from "../types";

const BASE = () => (process.env.DEADLOCK_API_URL || "https://api.deadlock-api.com").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, public status?: number, public retryAfterS?: number) {
    super(message);
  }
}

async function getJson(url: string, opts: { timeoutMs?: number; retries?: number } = {}): Promise<unknown> {
  const { timeoutMs = 12000, retries = 2 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (process.env.DEADLOCK_API_KEY) headers["x-api-key"] = process.env.DEADLOCK_API_KEY;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      if (res.status === 404) throw new ApiError("Nicht gefunden", 404);
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after")) || 5;
        throw new ApiError("Rate-Limit", 429, ra);
      }
      if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
      // 404 und 4xx (außer 429) sind endgültig – nicht wiederholen
      if (e instanceof ApiError && e.status && e.status < 500 && e.status !== 429) throw e;
      if (attempt < retries) {
        const wait = e instanceof ApiError && e.retryAfterS ? e.retryAfterS * 1000 : 500 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, Math.min(wait, 10000)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new ApiError(String(lastErr));
}

export async function fetchHistory(accountId: number): Promise<HistoryEntry[]> {
  const raw = await getJson(`${BASE()}/v1/players/${accountId}/match-history`);
  return normalizeHistory(raw, accountId);
}

/** Liefert null solange Valve die Metadaten noch nicht bereitgestellt hat (404). */
export async function fetchMatchDetails(matchId: number): Promise<MatchDetails | null> {
  try {
    const raw = await getJson(`${BASE()}/v1/matches/${matchId}/metadata`, { retries: 1 });
    return normalizeMetadata(raw);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export interface SteamProfile {
  accountId: number;
  name: string;
  avatar?: string;
  /** Durchschnittsrang des letzten Teams (nur Näherung für den eigenen Rang) */
  lastTeamAvgBadge?: number;
  matches30d?: number;
}

const toProfile = (r: Record<string, unknown>): SteamProfile[] => {
  const id = Number(r.account_id);
  const name = String(r.personaname ?? r.name ?? "");
  if (!id || !name) return [];
  const av = r.avatarfull ?? r.avatarmedium ?? r.avatar;
  return [{
    accountId: id,
    name,
    avatar: typeof av === "string" ? av : undefined,
    lastTeamAvgBadge: typeof r.last_team_avg_badge === "number" ? r.last_team_avg_badge : undefined,
    matches30d: typeof r.matches_played_last_30d === "number" ? r.matches_played_last_30d : undefined,
  }];
};

export async function fetchProfiles(accountIds: number[]): Promise<SteamProfile[]> {
  if (!accountIds.length) return [];
  try {
    const raw = await getJson(`${BASE()}/v1/players/steam?account_ids=${accountIds.join(",")}`, { retries: 1 });
    return Array.isArray(raw) ? raw.flatMap((r) => toProfile(r as Record<string, unknown>)) : [];
  } catch {
    return [];
  }
}

/** Namenssuche über Steam-Profile (statlocker-artige Spielersuche). */
export async function searchProfiles(query: string, limit = 12): Promise<SteamProfile[]> {
  const raw = await getJson(`${BASE()}/v1/players/steam-search?search_query=${encodeURIComponent(query)}&limit=${limit}`, { retries: 1 });
  return Array.isArray(raw) ? raw.flatMap((r) => toProfile(r as Record<string, unknown>)) : [];
}

/** Aktueller Rang (tier*10+subrank) oder null, wenn unbekannt/privat. */
export async function fetchRank(accountId: number): Promise<number | null> {
  try {
    const raw = (await getJson(`${BASE()}/v1/players/${accountId}/rank`, { retries: 1 })) as Record<string, unknown>;
    const badge = Number(raw?.badge);
    return badge > 0 ? badge : null;
  } catch {
    return null;
  }
}

export interface ActiveMatchDto {
  matchId: number;
  startTime: number;
  durationS: number;
  mode?: string;
  players: { accountId: number; heroId: number; team: 0 | 1 }[];
}

/** Laufende Matches der angegebenen Accounts (Live-Anzeige + schnelle Ende-Erkennung). */
export async function fetchActive(accountIds: number[]): Promise<ActiveMatchDto[]> {
  if (!accountIds.length) return [];
  const raw = await getJson(`${BASE()}/v1/matches/active?account_ids=${accountIds.join(",")}`, { retries: 0, timeoutMs: 8000 });
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((m: Record<string, unknown>) => {
    const matchId = Number(m.match_id);
    if (!matchId) return [];
    const players = Array.isArray(m.players) ? (m.players as Record<string, unknown>[]) : [];
    return [{
      matchId,
      startTime: Number(m.start_time) || 0,
      durationS: Number(m.duration_s) || 0,
      mode: modeLabel(m.match_mode, m.game_mode),
      players: players.flatMap((p) => (Number(p.account_id) || Number(p.hero_id) ? [{
        accountId: Number(p.account_id) || 0,
        heroId: Number(p.hero_id) || 0,
        team: (Number(p.team) === 1 || Number(p.team) === 3 ? 1 : 0) as 0 | 1,
      }] : [])),
    }];
  });
}

export interface HeroMeta { heroId: number; matches: number; wins: number }

/** Globale Helden-Statistik (Meta/Tierliste) der letzten Tage, nur Ranked. */
export async function fetchHeroMeta(days = 14): Promise<HeroMeta[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const raw = await getJson(`${BASE()}/v1/analytics/hero-stats?min_unix_timestamp=${since}&match_mode=ranked&bucket=no_bucket`, { retries: 1, timeoutMs: 20000 });
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r: Record<string, unknown>) => (Number(r.hero_id) ? [{ heroId: Number(r.hero_id), matches: Number(r.matches) || 0, wins: Number(r.wins) || 0 }] : []));
}

export interface LeaderboardRow { rank: number; name: string; heroIds: number[]; badge?: number }

export async function fetchLeaderboard(region: string): Promise<LeaderboardRow[]> {
  const raw = (await getJson(`${BASE()}/v1/leaderboard/${encodeURIComponent(region)}`, { retries: 1, timeoutMs: 20000 })) as Record<string, unknown>;
  const entries = Array.isArray(raw?.entries) ? (raw.entries as Record<string, unknown>[]) : [];
  return entries.slice(0, 200).map((e, i) => ({
    rank: Number(e.rank) || i + 1,
    name: String(e.account_name ?? "Unbekannt"),
    heroIds: Array.isArray(e.top_hero_ids) ? (e.top_hero_ids as number[]).slice(0, 3) : [],
    badge: typeof e.badge_level === "number" ? e.badge_level : undefined,
  }));
}
