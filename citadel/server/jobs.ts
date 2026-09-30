// Scheduler + Job-Queue in SQLite: fällige Quellen einreihen, Jobs mit Lease abarbeiten,
// exponentielles Backoff, Wiederaufnahme nach Absturz, Status je Quelle.

import { readFileSync } from 'node:fs';
import { all, get, nowIso, run, type Db } from './db.ts';
import type { ServerConfig } from './config.ts';
import type { Adapter, AdapterContext, JobRow, SourceRow } from './adapters/types.ts';
import { Fetcher, FetchError } from './net/fetcher.ts';
import { deadlockApiLeaderboard } from './adapters/deadlockApiLeaderboard.ts';
import { liquipedia } from './adapters/liquipedia.ts';
import { githubConfigs } from './adapters/githubConfigs.ts';
import { webPages } from './adapters/webPages.ts';
import { braveSearch } from './adapters/search.ts';
import { youtube } from './adapters/youtube.ts';
import type { AiExtractor } from './extract/ai.ts';

export const ADAPTERS: Record<string, Adapter> = Object.fromEntries([deadlockApiLeaderboard, liquipedia, githubConfigs, webPages, braveSearch, youtube].map((a) => [a.id, a]));

export interface SourceSeed {
  id: string;
  adapter: string;
  name: string;
  intervalHours?: number;
  intervalKind?: 'settings' | 'discovery';
  enabled?: boolean;
  config?: Record<string, unknown>;
  attribution?: string;
}

export function seedSources(db: Db, cfg: ServerConfig, seeds: SourceSeed[]) {
  for (const s of seeds) {
    const a = ADAPTERS[s.adapter];
    if (!a) throw new Error(`Unbekannter Adapter ${s.adapter}`);
    const interval = s.intervalHours ?? (s.intervalKind === 'discovery' ? cfg.discoveryIntervalHours : cfg.settingsIntervalHours);
    run(
      db,
      `INSERT INTO sources(id, adapter, name, config, enabled, interval_hours, terms_note, attribution) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET adapter=excluded.adapter, name=excluded.name, config=excluded.config, interval_hours=excluded.interval_hours, terms_note=excluded.terms_note, attribution=excluded.attribution`,
      s.id,
      s.adapter,
      s.name,
      JSON.stringify(s.config || {}),
      s.enabled === false ? 0 : 1,
      interval,
      a.terms,
      s.attribution ?? null,
    );
  }
}

export function loadSeedFile(path: string): SourceSeed[] {
  return JSON.parse(readFileSync(path, 'utf8')).sources;
}

export function enqueue(db: Db, sourceId: string, kind: string, payload: Record<string, unknown>, dedupeKey: string, delayS = 0): boolean {
  const runAfter = new Date(Date.now() + delayS * 1000).toISOString();
  const r = run(db, `INSERT OR IGNORE INTO crawl_jobs(source_id, kind, payload, dedupe_key, status, run_after, created_at) VALUES (?,?,?,?, 'queued', ?, ?)`, sourceId, kind, JSON.stringify(payload), dedupeKey, runAfter, nowIso());
  return Number(r.changes) > 0;
}

/** Aktualisiert den Status aller Quellen (inaktiv bei fehlenden Zugangsdaten) und reiht fällige ein. */
export function scheduleDue(db: Db, cfg: ServerConfig, now = new Date()): number {
  let n = 0;
  for (const s of all<SourceRow & { next_run_at: string | null }>(db, 'SELECT * FROM sources')) {
    const a = ADAPTERS[s.adapter];
    const missing = a?.missingRequirement(cfg);
    if (!s.enabled) {
      run(db, "UPDATE sources SET status = 'deaktiviert' WHERE id = ?", s.id);
      continue;
    }
    if (missing) {
      run(db, 'UPDATE sources SET status = ? WHERE id = ?', `inaktiv: ${missing}`, s.id);
      continue;
    }
    if (s.status.startsWith('inaktiv')) run(db, "UPDATE sources SET status = 'bereit' WHERE id = ?", s.id);
    if (!s.next_run_at || Date.parse(s.next_run_at) <= now.getTime()) {
      if (enqueue(db, s.id, 'source', {}, `source:${s.id}`)) n++;
      run(db, 'UPDATE sources SET next_run_at = ? WHERE id = ?', new Date(now.getTime() + s.interval_hours * 3600_000).toISOString(), s.id);
    }
  }
  return n;
}

/** Jobs, deren Lease abgelaufen ist (Worker abgestürzt), werden wieder aufgenommen. */
export function recoverStale(db: Db): number {
  const r = run(db, "UPDATE crawl_jobs SET status = 'queued', lease_until = NULL WHERE status = 'running' AND lease_until < ?", nowIso());
  return Number(r.changes);
}

export function claimNext(db: Db, leaseS = 600): JobRow | null {
  const j = get<JobRow>(db, "SELECT id, source_id, kind, payload, attempts FROM crawl_jobs WHERE status = 'queued' AND run_after <= ? ORDER BY run_after, id LIMIT 1", nowIso());
  if (!j) return null;
  const r = run(db, "UPDATE crawl_jobs SET status = 'running', attempts = attempts + 1, lease_until = ? WHERE id = ? AND status = 'queued'", new Date(Date.now() + leaseS * 1000).toISOString(), j.id);
  if (Number(r.changes) === 0) return null;
  return { ...j, attempts: j.attempts + 1 };
}

export const MAX_ATTEMPTS = 5;

export function backoffSeconds(attempts: number, retryAfterS?: number): number {
  if (retryAfterS && retryAfterS > 0) return Math.min(retryAfterS, 6 * 3600);
  return Math.min(60 * 2 ** (attempts - 1), 6 * 3600);
}

export interface WorkerDeps {
  db: Db;
  cfg: ServerConfig;
  fetcher: Fetcher;
  ai: AiExtractor | null;
  log?: (m: string) => void;
}

export async function runJob(deps: WorkerDeps, job: JobRow): Promise<{ ok: boolean; summary: string }> {
  const { db, cfg } = deps;
  const log = deps.log || ((m: string) => console.log(`[worker] ${m}`));
  const source = get<SourceRow>(db, 'SELECT * FROM sources WHERE id = ?', job.source_id);
  if (!source) {
    run(db, "UPDATE crawl_jobs SET status = 'failed', last_error = 'Quelle unbekannt', finished_at = ? WHERE id = ?", nowIso(), job.id);
    return { ok: false, summary: 'Quelle unbekannt' };
  }
  const adapter = ADAPTERS[source.adapter];
  const ctx: AdapterContext = {
    db,
    fetcher: deps.fetcher,
    cfg,
    ai: deps.ai,
    source,
    sourceConfig: JSON.parse(source.config),
    log: (m) => log(`${source.id}: ${m}`),
    enqueue: (sid, kind, payload, key, delay) => void enqueue(db, sid, kind, payload, key, delay),
  };
  run(db, 'UPDATE sources SET last_run_at = ? WHERE id = ?', nowIso(), source.id);
  try {
    const out = await adapter.run(ctx, job);
    run(db, "UPDATE crawl_jobs SET status = 'done', finished_at = ?, last_error = NULL WHERE id = ?", nowIso(), job.id);
    if (job.kind === 'source') run(db, "UPDATE sources SET status = 'ok', last_success_at = ?, last_error = NULL, consecutive_failures = 0 WHERE id = ?", nowIso(), source.id);
    log(`${source.id}/${job.kind}: ${out.summary}`);
    return { ok: true, summary: out.summary };
  } catch (e) {
    const err = e as Error;
    const fe = e instanceof FetchError ? e : null;
    const permanent = fe && (fe.code === 'blocked-target' || fe.code === 'robots' || fe.code === 'content-type' || (fe.status !== undefined && fe.status >= 400 && fe.status < 500 && fe.status !== 429 && fe.status !== 408));
    if (!permanent && job.attempts < MAX_ATTEMPTS) {
      const delay = backoffSeconds(job.attempts, fe?.retryAfterS);
      run(db, "UPDATE crawl_jobs SET status = 'queued', run_after = ?, last_error = ?, lease_until = NULL WHERE id = ?", new Date(Date.now() + delay * 1000).toISOString(), err.message, job.id);
    } else {
      run(db, "UPDATE crawl_jobs SET status = 'failed', finished_at = ?, last_error = ? WHERE id = ?", nowIso(), err.message, job.id);
    }
    if (job.kind === 'source') run(db, "UPDATE sources SET status = 'fehler', last_error = ?, consecutive_failures = consecutive_failures + 1 WHERE id = ?", err.message.slice(0, 500), source.id);
    log(`${source.id}/${job.kind} FEHLER (Versuch ${job.attempts}): ${err.message}`);
    return { ok: false, summary: err.message };
  }
}

/** Ein Durchlauf: Wiederaufnahme, Einplanen, Abarbeiten (bis maxJobs). */
export async function tick(deps: WorkerDeps, maxJobs = 50): Promise<number> {
  recoverStale(deps.db);
  scheduleDue(deps.db, deps.cfg);
  let n = 0;
  for (; n < maxJobs; n++) {
    const job = claimNext(deps.db);
    if (!job) break;
    await runJob(deps, job);
  }
  return n;
}

export function startWorker(deps: WorkerDeps, intervalMs = 15_000): () => void {
  let stopped = false;
  let running = false;
  const loop = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await tick(deps);
    } catch (e) {
      console.error('[worker] tick fehlgeschlagen', e);
    } finally {
      running = false;
    }
  };
  void loop();
  const t = setInterval(loop, intervalMs);
  return () => {
    stopped = true;
    clearInterval(t);
  };
}
