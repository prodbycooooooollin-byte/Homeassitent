// Zentrale Datenbank (SQLite über node:sqlite). Für den Start genügt eine Datei;
// das Schema ist bewusst schlicht und lässt sich später auf Postgres übertragen.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  adapter TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  interval_hours REAL NOT NULL,
  next_run_at TEXT,
  last_run_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'neu',
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  terms_note TEXT,
  attribution TEXT
);
CREATE TABLE IF NOT EXISTS crawl_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  dedupe_key TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  run_after TEXT NOT NULL,
  lease_until TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS crawl_jobs_open ON crawl_jobs(dedupe_key) WHERE status IN ('queued','running');
CREATE TABLE IF NOT EXISTS fetch_cache (
  url TEXT PRIMARY KEY,
  final_url TEXT,
  etag TEXT,
  last_modified TEXT,
  content_hash TEXT,
  http_status INTEGER,
  fetched_at TEXT,
  body TEXT
);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT 'unbekannt',
  category_evidence TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL,
  last_refreshed_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id),
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  handle_norm TEXT NOT NULL,
  url TEXT,
  evidence_url TEXT NOT NULL,
  link_type TEXT NOT NULL,
  UNIQUE(platform, handle_norm)
);
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT,
  player_hint TEXT,
  field TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL,
  unit TEXT,
  source_id TEXT,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  evidence TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  published_at TEXT,
  extractor_version TEXT NOT NULL,
  validation TEXT NOT NULL,
  origin TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS obs_dedupe ON observations(ifnull(player_id, ''), ifnull(player_hint, ''), field, context, source_url, value);
CREATE TABLE IF NOT EXISTS current_fields (
  player_id TEXT NOT NULL,
  field TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  observation_id INTEGER NOT NULL,
  PRIMARY KEY(player_id, field, context)
);
CREATE TABLE IF NOT EXISTS config_artifacts (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  source_id TEXT,
  file_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  retrieved_at TEXT NOT NULL,
  attribution TEXT NOT NULL,
  license TEXT,
  relation TEXT NOT NULL,
  player_id TEXT,
  supported TEXT NOT NULL DEFAULT '{}',
  not_adopted TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS change_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  player_id TEXT,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  source_url TEXT NOT NULL,
  kind TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  url TEXT
);
CREATE TABLE IF NOT EXISTS ai_cache (
  url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  result TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY(url, content_hash, extractor_version)
);
`;

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(SCHEMA);
  db.prepare('INSERT OR IGNORE INTO meta(k, v) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
  return db;
}

export const nowIso = () => new Date().toISOString();

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export type Row = Record<string, string | number | null>;

export function all<T = Row>(db: Db, sql: string, ...params: (string | number | null)[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function get<T = Row>(db: Db, sql: string, ...params: (string | number | null)[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function run(db: Db, sql: string, ...params: (string | number | null)[]) {
  return db.prepare(sql).run(...params);
}
