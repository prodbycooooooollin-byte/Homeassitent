import { normalizeHistory, normalizeMetadata } from "./normalize";
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
}

export async function fetchProfiles(accountIds: number[]): Promise<SteamProfile[]> {
  if (!accountIds.length) return [];
  try {
    const raw = await getJson(`${BASE()}/v1/players/steam?account_ids=${accountIds.join(",")}`, { retries: 1 });
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((r: Record<string, unknown>) => {
      const id = Number(r.account_id);
      const name = String(r.personaname ?? r.name ?? "");
      if (!id || !name) return [];
      return [{ accountId: id, name, avatar: typeof (r.avatarfull ?? r.avatar) === "string" ? String(r.avatarfull ?? r.avatar) : undefined }];
    });
  } catch {
    return [];
  }
}

export interface HeroInfo {
  id: number;
  name: string;
  icon?: string;
}
