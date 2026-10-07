import { fetchHistory, fetchMatchDetails, fetchProfiles } from "./api";
import { getStore, saveStore } from "./store";
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
    if (result.newMatches.length) player.lastNewMatchAt = now;
  } catch (e) {
    player.lastSyncAt = now;
    player.lastSyncOk = false;
    player.lastError = e instanceof Error ? e.message : String(e);
    result.error = player.lastError;
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
  try {
    const details = await fetchMatchDetails(matchId, focus);
    rec.detailsAttempts += 1;
    if (details) {
      rec.details = details;
      rec.detailsAt = now;
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
  } catch {
    rec.detailsAttempts += 1;
  }
  const age = now - rec.startTime * 1000;
  rec.nextDetailsAttemptAt = age > GIVE_UP_AFTER_MS ? Number.MAX_SAFE_INTEGER : now + nextAttemptDelayMs(rec.detailsAttempts);
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

let running: Promise<SyncResult[]> | null = null;

/** Ein kompletter Zyklus. Parallele Aufrufe (Poller + manueller Sync) teilen sich denselben Lauf. */
export function runCycle(): Promise<SyncResult[]> {
  if (running) return running;
  running = (async () => {
    const results: SyncResult[] = [];
    for (const p of Object.values(getStore().players)) results.push(await syncPlayer(p.accountId));
    await enrichPending();
    return results;
  })().finally(() => {
    running = null;
  });
  return running;
}
