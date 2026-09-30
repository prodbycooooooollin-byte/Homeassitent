import type { Db } from '../db.ts';
import type { Fetcher } from '../net/fetcher.ts';
import type { ServerConfig } from '../config.ts';
import type { AiExtractor } from '../extract/ai.ts';

export interface SourceRow {
  id: string;
  adapter: string;
  name: string;
  config: string;
  enabled: number;
  interval_hours: number;
  status: string;
}

export interface JobRow {
  id: number;
  source_id: string;
  kind: string;
  payload: string;
  attempts: number;
}

export interface AdapterContext {
  db: Db;
  fetcher: Fetcher;
  cfg: ServerConfig;
  ai: AiExtractor | null;
  source: SourceRow;
  sourceConfig: Record<string, unknown>;
  log(msg: string): void;
  /** Folgejob einreihen (dedupliziert über dedupeKey). */
  enqueue(sourceId: string, kind: string, payload: Record<string, unknown>, dedupeKey: string, delayS?: number): void;
}

export interface JobOutcome {
  summary: string;
  stats?: Record<string, number>;
}

export interface Adapter {
  id: string;
  description: string;
  /** Liefert einen Grund, falls das Adapter-Setup unvollständig ist (z. B. fehlender API-Schlüssel). */
  missingRequirement(cfg: ServerConfig): string | null;
  /** Hinweise zu Nutzungsbedingungen/Attribution (werden in der Quellenverwaltung angezeigt). */
  terms: string;
  /** Mindestabstand zwischen Anfragen an den Host in ms. */
  minIntervalMs: number;
  run(ctx: AdapterContext, job: JobRow): Promise<JobOutcome>;
}
