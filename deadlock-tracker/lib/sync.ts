import { ApiError, fetchActive, fetchHistory, fetchMatchDetails, fetchProfiles, fetchRank, type ActiveMatchDto } from "./api";
import { getStore, saveStore } from "./store";
import { steamBudgetLeft, useSteamBudget } from "./diag";
import { getSettings } from "./settings";
import { refreshRefs } from "./reference";
import { DETAILS_VERSION } from "./types";
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

export const MAX_GUESTS = 5;

/** Fügt einen Spieler hinzu. `guest` = nur ansehen (wird später selten synchronisiert und automatisch aufgeräumt). */
export async function addPlayer(accountId: number, opts: { guest?: boolean } = {}): Promise<TrackedPlayer> {
  const store = getStore();
  const key = String(accountId);
  if (store.players[key]) {
    if (store.players[key].guest) {
      if (opts.guest) store.players[key].lastViewedAt = Date.now();
      else { store.players[key].guest = false; store.players[key].addedAt = Date.now(); }
      saveStore();
    }
    return store.players[key];
  }
  if (!store.players[key]) {
    const [profile] = await fetchProfiles([accountId]);
    store.players[key] = {
      accountId,
      name: profile?.name ?? `Spieler ${accountId}`,
      avatar: profile?.avatar,
      addedAt: Date.now(),
      ...(opts.guest ? { guest: true, lastViewedAt: Date.now() } : {}),
    };
    // Gäste begrenzen: die am längsten nicht angesehenen entfernen
    const guests = Object.values(store.players).filter((p) => p.guest).sort((a, b) => (b.lastViewedAt ?? 0) - (a.lastViewedAt ?? 0));
    for (const g of guests.slice(MAX_GUESTS)) removePlayer(g.accountId);
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
  const upgrading = !!rec.details && rec.details.v !== DETAILS_VERSION;
  if (rec.details && !upgrading) return true;
  const focus = Number(Object.keys(rec.history)[0]) || 1;
  const ageMs = now - rec.startTime * 1000;
  // Steam-Fallback nur für frische Matches, erst nach ein paar vergeblichen Versuchen und nur im Budget (3/h pro IP).
  const allowSteam = rec.detailsAttempts >= 3 && ageMs < 6 * 3600_000 && steamBudgetLeft(now) > 0;
  try {
    if (allowSteam) useSteamBudget(now);
    const details = await fetchMatchDetails(matchId, focus, allowSteam);
    rec.detailsAttempts += 1;
    if (details) {
      if (upgrading) rec.upgradeTries = 0;
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
    if (upgrading) rec.upgradeTries = (rec.upgradeTries ?? 0) + 1;
  } catch (e) {
    rec.detailsAttempts += 1;
    rec.lastError = e instanceof Error ? e.message : String(e);
    if (e instanceof ApiError && e.status === 429) {
      rec.nextDetailsAttemptAt = now + Math.max(30, e.retryAfterS ?? 30) * 1000;
      saveStore();
      return false;
    }
  }
  if (upgrading) {
    // Alte Details bleiben erhalten; nach 3 vergeblichen Versuchen nicht weiter belästigen
    rec.nextDetailsAttemptAt = (rec.upgradeTries ?? 0) >= 3 ? Number.MAX_SAFE_INTEGER : now + 10 * 60_000;
    saveStore();
    return true;
  }
  rec.nextDetailsAttemptAt = ageMs > GIVE_UP_AFTER_MS ? Number.MAX_SAFE_INTEGER : now + nextAttemptDelayMs(rec.detailsAttempts);
  saveStore();
  return false;
}

export async function enrichPending(now = Date.now()): Promise<number> {
  const store = getStore();
  // Ältere Details (ohne Zeitreihen etc.) werden für die neuesten Matches einmalig aufgewertet.
  for (const m of Object.values(store.matches).sort((a, b) => b.startTime - a.startTime).slice(0, 150)) {
    if (m.details && m.details.v !== DETAILS_VERSION && m.nextDetailsAttemptAt === Number.MAX_SAFE_INTEGER && (m.upgradeTries ?? 0) < 3) m.nextDetailsAttemptAt = now;
  }
  // Hintergrund-Nachladen: noch nie versuchte (ältere) Matches nach und nach vollständig laden – damit Mitspieler,
  // Analysen und Match-Tabs auf der gesamten Historie beruhen. Bewusst sanft (3 pro Takt), das API-Limit liegt bei 100/10 s.
  if (getSettings().backfill) {
    const backlog = Object.values(store.matches)
      .filter((m) => !m.details && m.detailsAttempts === 0 && m.nextDetailsAttemptAt === Number.MAX_SAFE_INTEGER)
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 3);
    for (const m of backlog) m.nextDetailsAttemptAt = now;
  }
  const due = Object.values(store.matches)
    .filter((m) => (!m.details || m.details.v !== DETAILS_VERSION) && m.nextDetailsAttemptAt <= now)
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

/* ---- Match-Hinweise ---------------------------------------------------------------
 * Die Desktop-App erkennt das Match-Ende schon vor der API (Steam-Cache, Ingest-Protokoll, Spielprozess). Ein Hinweis mit Match-ID
 * wird hier so lange im Hintergrund versucht, bis das Match geladen werden kann – unabhängig davon, wann die Historie es meldet. */
interface Hint { matchId: number; source: string; at: number; tries: number; nextAt: number; last?: string; done?: "ok" | "fremd" | "aufgegeben" }
const gh = globalThis as unknown as { __dlHints?: Map<number, Hint>; __dlGame?: { running: boolean; since: number | null; endedAt: number | null } };
const hints = () => (gh.__dlHints ??= new Map());
export interface GameLog { available: boolean; file: string | null; state: string | null; stateN: number | null; stateAt: number | null; server: string | null; heroes: string[]; matchStartedAt: number | null; matchEndedAt: number | null; updatedAt: number | null }
export const gameLog = (): GameLog | null => (globalThis as unknown as { __dlGameLog?: GameLog }).__dlGameLog ?? null;
export const gameState = () => gh.__dlGame ?? { running: false, since: null, endedAt: null };
export const hintStatus = () => [...hints().values()].sort((a, b) => b.at - a.at).slice(0, 8);

export function hintMatch(matchId: number, source = "unbekannt", now = Date.now()): boolean {
  if (!matchId || hints().has(matchId) || getStore().matches[matchId]?.details) return false;
  hints().set(matchId, { matchId, source, at: now, tries: 0, nextAt: now });
  live().fastUntil = Math.max(live().fastUntil, now + 25 * 60_000);
  return true;
}

const hintDelayS = (tries: number) => [5, 10, 15, 20, 30][tries] ?? 45;

export async function processHints(now = Date.now()): Promise<void> {
  for (const h of hints().values()) {
    if (h.done || now < h.nextAt) continue;
    if (getStore().matches[h.matchId]?.details) { h.done = "ok"; continue; }
    // Hinweise aus dem Ingest-Protokoll können beliebige Zahlen enthalten – nicht ewig versuchen
    const maxTries = h.source === "ingest" ? 12 : 60;
    // Steam-Fallback nur gelegentlich (Budget 3/h pro IP)
    const allowSteam = (h.tries === 1 || h.tries % 12 === 11) && steamBudgetLeft(now) > 0;
    if (allowSteam) useSteamBudget(now);
    h.tries++;
    const r = await importMatchById(h.matchId, now, { allowSteam, markLive: true }).catch((e) => ({ ok: false, error: String(e), notMine: false }));
    if (r.ok) { h.done = "ok"; h.last = undefined; continue; }
    h.last = r.error;
    if (r.notMine) { h.done = "fremd"; continue; }
    if (h.tries >= maxTries) { h.done = "aufgegeben"; continue; }
    h.nextAt = now + hintDelayS(h.tries) * 1000;
  }
  // Erledigte Hinweise nach einer Weile vergessen
  for (const [id, h] of hints()) if (h.done && now - h.at > 3600_000) hints().delete(id);
}

let running: Promise<SyncResult[]> | null = null;

/** Ein Zyklus. `force` ignoriert den Takt (manueller Sync); parallele Aufrufe teilen sich denselben Lauf. */
export function runCycle(force = false): Promise<SyncResult[]> {
  if (running) return running;
  running = (async () => {
    const now = Date.now();
    const results: SyncResult[] = [];
    const baseMs = (getSettings().pollIntervalS || Number(process.env.POLL_INTERVAL_S) || 20) * 1000;
    await refreshLive(now);
    await processHints(now).catch(() => null);
    // Schnell abfragen: nach Spielende, bei laufendem Spiel (Desktop-App erkennt den Spielprozess) und nach Match-Hinweisen
    const game = gameState();
    const gl = gameLog();
    const hot = now < live().fastUntil || (gl?.matchEndedAt != null && now - gl.matchEndedAt < 25 * 60_000) || (game.endedAt !== null && now - game.endedAt < 25 * 60_000);
    const everyMs = hot ? 6000 : game.running ? Math.min(baseMs, 12_000) : baseMs;
    for (const p of Object.values(getStore().players)) {
      if (!force && p.lastSyncAt && now - p.lastSyncAt < (p.guest ? 10 * 60_000 : everyMs - 500)) continue;
      if (!force && p.historyBackoffUntil && now < p.historyBackoffUntil) continue;
      results.push(await syncPlayer(p.accountId));
    }
    await enrichPending();
    await refreshRefs(now).catch(() => 0);
    return results;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Zieht eine Match-ID aus Text oder Link (z. B. statlocker.gg/match/12345678). */
export function parseMatchId(input: string): number | null {
  const m = input.match(/\d{6,}/g);
  return m ? Number(m[m.length - 1]) : null;
}

/**
 * Manueller Import per Match-ID – unabhängig von der Spieler-Historie, die der API manchmal erst Stunden später meldet.
 * Lädt die Details (mit Steam-Fallback) und legt das Match für alle getrackten Spieler an, die darin vorkommen.
 */
export async function importMatchById(matchId: number, now = Date.now(), opts: { allowSteam?: boolean; markLive?: boolean } = {}): Promise<{ ok: boolean; error?: string; accounts?: number[]; notMine?: boolean }> {
  const store = getStore();
  let details;
  try {
    details = await fetchMatchDetails(matchId, 1, opts.allowSteam ?? true);
  } catch (e) {
    return { ok: false, error: e instanceof ApiError && e.status === 429 ? "Rate-Limit – bitte in einer Minute erneut versuchen." : e instanceof Error ? e.message : String(e) };
  }
  if (!details) return { ok: false, error: "Match ist noch nicht verfügbar (weder im Archiv noch bei Valve). Später erneut versuchen." };
  const mine = details.players.filter((p) => store.players[String(p.accountId)]);
  if (!mine.length) return { ok: false, error: "Keiner deiner getrackten Spieler kommt in diesem Match vor.", notMine: true };
  const isNew = !store.matches[matchId];
  const rec = (store.matches[matchId] ??= { matchId, startTime: details.startTime, history: {}, detailsAttempts: 0, nextDetailsAttemptAt: Number.MAX_SAFE_INTEGER, firstSeenAt: now, detectedLive: false });
  if (isNew && opts.markLive) rec.detectedLive = true; // erscheint wie ein im Betrieb erkanntes Match (Hinweis + Debrief)
  for (const p of mine) {
    rec.history[String(p.accountId)] ??= {
      matchId, accountId: p.accountId, heroId: p.heroId, startTime: details.startTime, durationS: details.durationS,
      won: details.winningTeam === p.team, team: p.team, kills: p.kills, deaths: p.deaths, assists: p.assists,
      netWorth: p.netWorth, lastHits: p.lastHits, denies: p.denies, heroLevel: p.level, abandoned: p.abandoned,
      matchMode: details.matchMode, gameMode: details.gameMode, badge: p.badge,
    };
  }
  const profiles = await fetchProfiles(details.players.filter((p) => !p.name).map((p) => p.accountId).filter(Boolean)).catch(() => []);
  const byId = new Map(profiles.map((p) => [p.accountId, p]));
  for (const p of details.players) { const pr = byId.get(p.accountId); if (pr) { p.name = pr.name; p.avatar = pr.avatar; } }
  rec.details = details;
  rec.detailsAt = now;
  rec.lastError = undefined;
  rec.nextDetailsAttemptAt = Number.MAX_SAFE_INTEGER;
  saveStore();
  return { ok: true, accounts: mine.map((p) => p.accountId) };
}
