import { ApiError, fetchActive, fetchHistory, fetchMatchDetails, fetchProfiles, fetchRank, type ActiveMatchDto } from "./api";
import { getStore, saveStore } from "./store";
import { steamBudgetLeft, useSteamBudget } from "./diag";
import type { MatchRecord, TrackedPlayer } from "./types";

/**
 * Zuverlässige Match-Erkennung in zwei Stufen:
 *  1. Historie pollen (kurzes Intervall) -> neues Match wird sofort mit KDA/Hero/Ergebnis angelegt.
 *  2. Details (beide Teams, Rang, Schaden …) werden mit Backoff nachgeladen, sobald Valve sie liefert.
 * Jeder Lauf gleicht die *komplette* Historie ab (idempotent über match_id) – ein verpasster
 * Poll, ein Neustart oder ein API-Ausfall kann deshalb nie zu dauerhaft fehlenden Matches führen.
 */

const RETRY_SCHEDULE_S = [10, 20, 30, 60, 120, 300, 600, 900];
const GIVE_UP_AFTER_MS = 14 * 24 * 3600 * 1000;
const ENRICH_PER_CYCLE = 6;
const INITIAL_ENRICH = 20;

export function nextAttemptDelayMs(attempts: number): number {
  return RETRY_SCHEDULE_S[Math.min(attempts, RETRY_SCHEDULE_S.length - 1)] * 1000;
}

export async function addPlayer(accountId: number): Promise<TrackedPlayer> {
  const store = getStore();
  const key = String(accountId);
  if (!store.players[key]) {
    const [profile] = await fetchProfiles([accountId]);
    store.players[key] = {
      accountId,
      name: profile?.name ?? `Spieler ${accountId}`,
      avatar: profile?.avatar,
      addedAt: Date.now(),
    };
    saveStore();
  }
  return store.players[key];
}

export function removePlayer(accountId: number): void {
  const store = getStore();
  delete store.players[String(accountId)];
  for (const [id, m] of Object.entries(store.matches)) {
    delete m.history[String(accountId)];
    if (!Object.keys(m.history).length) delete store.matches[id];
  }
  saveStore();
}

export interface SyncResult {
  accountId: number;
  newMatches: number[];
  error?: string;
}

export async function syncPlayer(accountId: number, now = Date.now()): Promise<SyncResult> {
  const store = getStore();
  const player = store.players[String(accountId)];
  const result: SyncResult = { accountId, newMatches: [] };
  if (!player) return { ...result, error: "Spieler nicht getrackt" };
  const firstImport = !player.lastSyncAt;
  try {
    const history = await fetchHistory(accountId);
    const sorted = [...history].sort((a, b) => b.startTime - a.startTime);
    sorted.forEach((h, i) => {
      let rec = store.matches[h.matchId];
      if (!rec) {
        // Beim Erst-Import nur die neuesten Matches sofort anreichern, den Rest lazy beim Öffnen.
        const eager = !firstImport || i < INITIAL_ENRICH;
        rec = {
          matchId: h.matchId,
          startTime: h.startTime,
          history: {},
          detailsAttempts: 0,
          nextDetailsAttemptAt: eager ? 0 : Number.MAX_SAFE_INTEGER,
          firstSeenAt: now,
          detectedLive: !firstImport,
        } satisfies MatchRecord;
        store.matches[h.matchId] = rec;
        if (!firstImport) result.newMatches.push(h.matchId);
      }
      rec.history[String(accountId)] = h;
    });
    player.lastSyncAt = now;
    player.lastSyncOk = true;
    player.lastError = undefined;
    player.historyBackoffUntil = undefined;
    if (result.newMatches.length) player.lastNewMatchAt = now;
    // Rang: nach neuen Matches und sonst alle 10 Min aktualisieren; Rang-Fehler dürfen den Sync nie scheitern lassen.
    if (result.newMatches.length || firstImport || !player.rank || now - player.rank.at > 10 * 60_000) {
      const badge = await fetchRank(accountId).catch(() => null);
      if (badge) player.rank = { badge, at: now };
      else if (player.rank) player.rank = { ...player.rank, at: now };
    }
    // Namen/Avatar bei Gelegenheit auffrischen (z. B. Namensänderung)
    if (!player.avatar || result.newMatches.length) {
      const [pr] = await fetchProfiles([accountId]).catch(() => []);
      if (pr) { player.name = pr.name; player.avatar = pr.avatar ?? player.avatar; }
    }
  } catch (e) {
    player.lastSyncAt = now;
    player.lastSyncOk = false;
    player.lastError = e instanceof Error ? e.message : String(e);
    result.error = player.lastError;
    if (e instanceof ApiError && e.status === 429) {
      // Rate-Limit: Daten bleiben erhalten, wir pausieren das Polling dieses Accounts
      player.historyBackoffUntil = now + Math.max(60, e.retryAfterS ?? 60) * 1000;
    }
  }
  saveStore();
  return result;
}

/** Lädt Details für ein Match (z. B. beim Öffnen). Gibt true zurück, wenn jetzt Details vorliegen. */
export async function enrichMatch(matchId: number, now = Date.now()): Promise<boolean> {
  const store = getStore();
  const rec = store.matches[matchId];
  if (!rec) return false;
  if (rec.details) return true;
  const focus = Number(Object.keys(rec.history)[0]) || 1;
  const ageMs = now - rec.startTime * 1000;
  // Steam-Fallback nur für frische Matches, erst nach ein paar vergeblichen Versuchen und nur im Budget (3/h pro IP).
  const allowSteam = rec.detailsAttempts >= 3 && ageMs < 6 * 3600_000 && steamBudgetLeft(now) > 0;
  try {
    if (allowSteam) useSteamBudget(now);
    const details = await fetchMatchDetails(matchId, focus, allowSteam);
    rec.detailsAttempts += 1;
    if (details) {
      rec.details = details;
      rec.detailsAt = now;
      rec.lastError = undefined;
      const profiles = await fetchProfiles(
        details.players.filter((p) => !p.name).map((p) => p.accountId).filter(Boolean),
      );
      const byId = new Map(profiles.map((p) => [p.accountId, p]));
      for (const p of details.players) {
        const pr = byId.get(p.accountId);
        if (pr) {
          p.name = pr.name;
          p.avatar = pr.avatar;
        }
      }
      rec.nextDetailsAttemptAt = Number.MAX_SAFE_INTEGER;
      saveStore();
      return true;
    }
    rec.lastError = allowSteam ? "Noch nicht bei Valve verfügbar" : "Noch nicht im Archiv – wird erneut versucht";
  } catch (e) {
    rec.detailsAttempts += 1;
    rec.lastError = e instanceof Error ? e.message : String(e);
    if (e instanceof ApiError && e.status === 429) {
      rec.nextDetailsAttemptAt = now + Math.max(30, e.retryAfterS ?? 30) * 1000;
      saveStore();
      return false;
    }
  }
  rec.nextDetailsAttemptAt = ageMs > GIVE_UP_AFTER_MS ? Number.MAX_SAFE_INTEGER : now + nextAttemptDelayMs(rec.detailsAttempts);
  saveStore();
  return false;
}

export async function enrichPending(now = Date.now()): Promise<number> {
  const store = getStore();
  const due = Object.values(store.matches)
    .filter((m) => !m.details && m.nextDetailsAttemptAt <= now)
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, ENRICH_PER_CYCLE);
  let ok = 0;
  for (const m of due) if (await enrichMatch(m.matchId, now)) ok++;
  return ok;
}

/* ---- Live-Erkennung -------------------------------------------------------------
 * /v1/matches/active zeigt laufende Matches. Verschwindet ein Match, ist es gerade beendet:
 * dann pollen wir die Historie für einige Minuten im 5-s-Takt statt im Normaltakt – so ist das
 * neue Match typischerweise innerhalb von Sekunden nach dem Eintrag in der API da. */
interface LiveState { byAccount: Map<number, ActiveMatchDto>; fastUntil: number; checkedAt: number; ok: boolean }
const gl = globalThis as unknown as { __dlLive?: LiveState };
const live = (): LiveState => (gl.__dlLive ??= { byAccount: new Map(), fastUntil: 0, checkedAt: 0, ok: true });

export function getLive(accountId: number): ActiveMatchDto | null {
  return live().byAccount.get(accountId) ?? null;
}
export const liveStatus = () => ({ checkedAt: live().checkedAt, ok: live().ok, fast: Date.now() < live().fastUntil });

export async function refreshLive(now = Date.now()): Promise<void> {
  const L = live();
  const ids = Object.values(getStore().players).map((p) => p.accountId);
  if (!ids.length) return;
  try {
    const active = await fetchActive(ids);
    const next = new Map<number, ActiveMatchDto>();
    for (const m of active) for (const p of m.players) if (ids.includes(p.accountId)) next.set(p.accountId, m);
    for (const id of L.byAccount.keys()) if (!next.has(id)) L.fastUntil = now + 4 * 60_000; // Match gerade beendet
    L.byAccount = next;
    L.ok = true;
  } catch {
    L.ok = false; // Live-Anzeige ist optional – Historie-Polling läuft unabhängig weiter
  }
  L.checkedAt = now;
}

let running: Promise<SyncResult[]> | null = null;

/** Ein Zyklus. `force` ignoriert den Takt (manueller Sync); parallele Aufrufe teilen sich denselben Lauf. */
export function runCycle(force = false): Promise<SyncResult[]> {
  if (running) return running;
  running = (async () => {
    const now = Date.now();
    const results: SyncResult[] = [];
    const baseMs = Math.max(5, Number(process.env.POLL_INTERVAL_S) || 20) * 1000;
    await refreshLive(now);
    const everyMs = now < live().fastUntil ? 5000 : baseMs;
    for (const p of Object.values(getStore().players)) {
      if (!force && p.lastSyncAt && now - p.lastSyncAt < everyMs - 500) continue;
      if (!force && p.historyBackoffUntil && now < p.historyBackoffUntil) continue;
      results.push(await syncPlayer(p.accountId));
    }
    await enrichPending();
    return results;
  })().finally(() => {
    running = null;
  });
  return running;
}
