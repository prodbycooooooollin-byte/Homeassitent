import { normalizeHistory, normalizeMetadata } from "./normalize";
import { modeLabel } from "../modes";
import { logCall } from "../diag";
import type { HistoryEntry, MatchDetails } from "../types";

const BASE = () => (process.env.DEADLOCK_API_URL || "https://api.deadlock-api.com").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, public status?: number, public retryAfterS?: number) {
    super(message);
  }
}

async function getJson(url: string, opts: { timeoutMs?: number; retries?: number; accept429?: boolean } = {}): Promise<unknown> {
  const { timeoutMs = 12000, retries = 2, accept429 = false } = opts;
  const path = url.replace(BASE(), "").replace(/\?.*$/, "");
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = Date.now();
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (process.env.DEADLOCK_API_KEY) headers["x-api-key"] = process.env.DEADLOCK_API_KEY;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      logCall({ at: t0, path, status: res.status, ms: Date.now() - t0 });
      if (res.status === 404) throw new ApiError("Nicht gefunden", 404);
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after")) || 5;
        // Laut Spec liefert die Historie bei 429 trotzdem die gecachten Einträge.
        if (accept429) {
          const body = await res.json().catch(() => null);
          if (Array.isArray(body)) return body;
        }
        throw new ApiError("Rate-Limit", 429, ra);
      }
      if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (!(e instanceof ApiError)) logCall({ at: t0, path, status: "ERR", ms: Date.now() - t0, note: e instanceof Error ? e.message : String(e) });
      // 404 und 4xx (außer 429) sind endgültig – nicht wiederholen; 429 meldet der Aufrufer (Backoff dort)
      if (e instanceof ApiError && e.status && e.status < 500) throw e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** attempt, 4000)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new ApiError(String(lastErr));
}

export async function fetchHistory(accountId: number): Promise<HistoryEntry[]> {
  const raw = await getJson(`${BASE()}/v1/players/${accountId}/match-history`, { accept429: true });
  return normalizeHistory(raw, accountId);
}

/**
 * Match-Details (beide Teams, Ränge, Zeitreihen). Liefert null, solange sie noch nicht bereitstehen (404).
 * Standardmäßig ohne Steam-Fallback (`disable_steam`), da der nur 3×/h pro IP erlaubt ist – der Aufrufer
 * entscheidet über das Budget (lib/diag.ts).
 */
export async function fetchMatchDetails(matchId: number, allowSteam = false): Promise<MatchDetails | null> {
  try {
    const raw = await getJson(`${BASE()}/v1/matches/${matchId}/metadata${allowSteam ? "" : "?disable_steam=true"}`, { retries: 1, timeoutMs: allowSteam ? 25000 : 12000 });
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

/** Steam-Avatare gibt es in 32/64/184 px (Endung, _medium, _full) – wir wollen immer die große Variante. */
export function upgradeAvatar(url: string): string {
  return url.replace(/\/([0-9a-f]{40})(_medium|_full)?\.jpg(\?.*)?$/i, "/$1_full.jpg");
}

const toProfile = (r: Record<string, unknown>): SteamProfile[] => {
  const id = Number(r.account_id);
  const name = String(r.personaname ?? r.name ?? "");
  if (!id || !name) return [];
  const av = r.avatarfull ?? r.avatarmedium ?? r.avatar;
  return [{
    accountId: id,
    name,
    avatar: typeof av === "string" ? upgradeAvatar(av) : undefined,
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
  /** Team-Souls (Hidden King, Archmother) laut Zuschauer-Daten */
  netWorth: [number, number] | null;
  /** Anzahl zerstörter Objectives je Team (Bit-Zählung der Objective-Maske) */
  objectives: [number, number] | null;
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
      netWorth: typeof m.net_worth_team_0 === "number" && typeof m.net_worth_team_1 === "number" ? [m.net_worth_team_0, m.net_worth_team_1] : null,
      objectives: typeof m.objectives_mask_team0 === "number" && typeof m.objectives_mask_team1 === "number" ? [popcount(m.objectives_mask_team0), popcount(m.objectives_mask_team1)] : null,
      players: players.flatMap((p) => (Number(p.account_id) || Number(p.hero_id) ? [{
        accountId: Number(p.account_id) || 0,
        heroId: Number(p.hero_id) || 0,
        team: (Number(p.team) === 1 || Number(p.team) === 3 ? 1 : 0) as 0 | 1,
      }] : [])),
    }];
  });
}

const popcount = (n: number) => { let c = 0; let v = Math.max(0, Math.floor(n)); while (v > 0) { c += v % 2; v = Math.floor(v / 2); } return c; };

export interface HeroMeta { heroId: number; matches: number; wins: number }

/** Globale Helden-Statistik (Meta/Tierliste) der letzten Tage, nur Ranked. */
export async function fetchHeroMeta(days = 14): Promise<HeroMeta[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const raw = await getJson(`${BASE()}/v1/analytics/hero-stats?min_unix_timestamp=${since}&match_mode=ranked&bucket=no_bucket`, { retries: 1, timeoutMs: 20000 });
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r: Record<string, unknown>) => (Number(r.hero_id) ? [{ heroId: Number(r.hero_id), matches: Number(r.matches) || 0, wins: Number(r.wins) || 0 }] : []));
}

export interface LeaderboardRow {
  /** Platz in der Liste (1 = bester) */
  place: number;
  name: string;
  heroIds: number[];
  /** Rang-Badge (tier*10+subtier) laut API-Feld `rank` */
  badge?: number;
  /** Mögliche Steam-Account-IDs (laut API nicht immer korrekt) */
  accountIds: number[];
}

export async function fetchLeaderboard(region: string, heroId?: number): Promise<LeaderboardRow[]> {
  const path = heroId ? `/v1/leaderboard/${encodeURIComponent(region)}/${heroId}` : `/v1/leaderboard/${encodeURIComponent(region)}`;
  const raw = (await getJson(`${BASE()}${path}`, { retries: 1, timeoutMs: 20000 })) as Record<string, unknown>;
  const entries = Array.isArray(raw?.entries) ? (raw.entries as Record<string, unknown>[]) : [];
  return entries.slice(0, 250).map((e, i) => ({
    place: i + 1,
    name: String(e.account_name ?? "Unbekannt"),
    heroIds: Array.isArray(e.top_hero_ids) ? (e.top_hero_ids as number[]).slice(0, 3) : [],
    badge: typeof e.rank === "number" && e.rank > 0 ? e.rank : undefined,
    accountIds: Array.isArray(e.possible_account_ids) ? (e.possible_account_ids as number[]).slice(0, 3) : [],
  }));
}

export interface BadgeBucket { badge: number; players: number }

/** Verteilung der Ranked-Spieler über alle Badges (für „Top X %“). */
export async function fetchBadgeDistribution(): Promise<BadgeBucket[]> {
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const raw = await getJson(`${BASE()}/v1/analytics/badge-distribution?match_mode=ranked&min_unix_timestamp=${since}`, { retries: 1, timeoutMs: 20000 });
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r: Record<string, unknown>) => (Number(r.badge_level) > 0 ? [{ badge: Number(r.badge_level), players: Number(r.unique_players) || Number(r.total_matches) || 0 }] : []));
}

/* ---- Mitspieler / Gegner über die gesamte Historie (serverseitig vom API aggregiert) ---- */
export interface MateRow { accountId: number; games: number; wins: number; matchIds: number[] }

export async function fetchMates(accountId: number, kind: "mates" | "enemies" | "party", minGames = 2): Promise<MateRow[]> {
  const path = kind === "enemies" ? "enemy-stats" : "mate-stats";
  const extra = kind === "party" ? "&same_party=true" : "";
  const raw = await getJson(`${BASE()}/v1/players/${accountId}/${path}?min_matches_played=${minGames}${extra}`, { retries: 1, timeoutMs: 25000 });
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r: Record<string, unknown>) => {
    const id = Number(kind === "enemies" ? r.enemy_id : r.mate_id);
    if (!id) return [];
    return [{ accountId: id, games: Number(r.matches_played) || 0, wins: Number(r.wins) || 0, matchIds: Array.isArray(r.matches) ? (r.matches as number[]).slice(-12) : [] }];
  }).sort((a, b) => b.games - a.games).slice(0, 80);
}

/* ---- Helden-Wissen: Community-Builds, beliebte Items, Counter, Synergien ---- */
export interface BuildDto { id: number; name: string; description?: string; authorId: number; favorites: number; weeklyFavorites: number; updated?: number; categories: { name: string; itemIds: number[] }[] }

export async function fetchBuilds(heroId: number, limit = 4): Promise<BuildDto[]> {
  const raw = await getJson(`${BASE()}/v1/builds?hero_id=${heroId}&sort_by=weekly_favorites&sort_direction=desc&only_latest=true&limit=${limit}`, { retries: 1, timeoutMs: 20000 });
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((b: Record<string, unknown>) => {
    const hb = (b.hero_build ?? {}) as Record<string, unknown>;
    const id = Number(hb.hero_build_id);
    if (!id) return [];
    const det = (hb.details ?? {}) as Record<string, unknown>;
    const cats = Array.isArray(det.mod_categories) ? (det.mod_categories as Record<string, unknown>[]) : [];
    return [{
      id, name: String(hb.name ?? `Build ${id}`), description: typeof hb.description === "string" ? hb.description : undefined,
      authorId: Number(hb.author_account_id) || 0, favorites: Number(b.num_favorites) || 0, weeklyFavorites: Number(b.num_weekly_favorites) || 0,
      updated: Number(hb.last_updated_timestamp) || undefined,
      categories: cats.slice(0, 8).map((c) => ({
        name: String(c.name ?? ""),
        itemIds: (Array.isArray(c.mods) ? (c.mods as Record<string, unknown>[]) : []).map((m) => Number(m.ability_id)).filter(Boolean).slice(0, 12),
      })),
    }];
  });
}

export async function fetchTopItems(heroId: number): Promise<{ itemId: number; builds: number }[]> {
  const raw = await getJson(`${BASE()}/v1/analytics/build-item-stats?hero_id=${heroId}`, { retries: 1, timeoutMs: 20000 });
  return Array.isArray(raw) ? raw.map((r: Record<string, unknown>) => ({ itemId: Number(r.item_id), builds: Number(r.builds) || 0 })).filter((r) => r.itemId).sort((a, b) => b.builds - a.builds).slice(0, 14) : [];
}

export interface MatchupRow { heroId: number; matches: number; wins: number }

export async function fetchCounters(heroId: number): Promise<MatchupRow[]> {
  const since = Math.floor(Date.now() / 1000) - 21 * 86400;
  const raw = await getJson(`${BASE()}/v1/analytics/hero-counter-stats?match_mode=ranked&min_unix_timestamp=${since}`, { retries: 1, timeoutMs: 25000 });
  return Array.isArray(raw) ? raw.flatMap((r: Record<string, unknown>) => (Number(r.hero_id) === heroId ? [{ heroId: Number(r.enemy_hero_id), matches: Number(r.matches_played) || 0, wins: Number(r.wins) || 0 }] : [])) : [];
}

export async function fetchSynergies(heroId: number): Promise<MatchupRow[]> {
  const since = Math.floor(Date.now() / 1000) - 21 * 86400;
  const raw = await getJson(`${BASE()}/v1/analytics/hero-synergy-stats?match_mode=ranked&min_unix_timestamp=${since}`, { retries: 1, timeoutMs: 25000 });
  return Array.isArray(raw) ? raw.flatMap((r: Record<string, unknown>) => {
    const a = Number(r.hero_id1), b = Number(r.hero_id2);
    if (a !== heroId && b !== heroId) return [];
    return [{ heroId: a === heroId ? b : a, matches: Number(r.matches_played) || 0, wins: Number(r.wins) || 0 }];
  }) : [];
}

/** Aktuelle Rang-Badges mehrerer Spieler auf einmal (0 = unbekannt). */
export async function fetchRanks(accountIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!accountIds.length) return out;
  try {
    const raw = await getJson(`${BASE()}/v1/players/rank?account_ids=${accountIds.join(",")}`, { retries: 1, timeoutMs: 15000 });
    if (Array.isArray(raw)) for (const r of raw as Record<string, unknown>[]) { const id = Number(r.account_id), b = Number(r.badge); if (id && b > 0) out.set(id, b); }
  } catch { /* ohne Ränge weiter */ }
  return out;
}

/* ---- Referenzkurven (Durchschnitt + Streuung je Spielfortschritt) ---- */
export interface CurvePoint { pct: number; nw: [number, number]; k: [number, number]; d: [number, number]; a: [number, number]; dmg: [number, number] }

/** Durchschnittlicher Verlauf von Spielern ähnlichen Ranges (optional auf einen Helden eingeschränkt). */
export async function fetchPerformanceCurve(heroId: number | null, minBadge: number, maxBadge: number): Promise<CurvePoint[]> {
  const q = new URLSearchParams({ match_mode: "ranked", resolution: "10", min_average_badge: String(minBadge), max_average_badge: String(maxBadge), min_unix_timestamp: String(Math.floor(Date.now() / 1000) - 30 * 86400) });
  if (heroId) q.set("hero_ids", String(heroId));
  const raw = await getJson(`${BASE()}/v1/analytics/player-performance-curve?${q}`, { retries: 1, timeoutMs: 25000 });
  if (!Array.isArray(raw)) return [];
  const pair = (r: Record<string, unknown>, key: string): [number, number] => [Number(r[`${key}_avg`]) || 0, Number(r[`${key}_std`]) || 0];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({ pct: Number(r.game_time), nw: pair(r, "net_worth"), k: pair(r, "kills"), d: pair(r, "deaths"), a: pair(r, "assists"), dmg: pair(r, "player_damage") }))
    .filter((p) => Number.isFinite(p.pct))
    .sort((a, b) => a.pct - b.pct);
}
