import { createHash } from 'node:crypto';

/**
 * Datensparsamer Logger: nur Ereignisname und explizit erlaubte, nicht
 * personenbezogene Felder. Keine Likes, Tokens, Namen oder Clip-Zuordnungen.
 */
const ALLOWED_FIELDS = new Set([
  'room',
  'phase',
  'players',
  'rooms',
  'reason',
  'code',
  'status',
  'count',
  'ms',
  'port',
  'attempt',
  'error',
  'version',
  'stage'
]);

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  /** Für Tests: alle geschriebenen Zeilen. */
  lines?: string[];
}

/** Kurzer, nicht umkehrbarer Bezeichner für Raum-IDs in Logs. */
export function anon(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 8);
}

export function createLogger(level: Level = 'info', sink: (line: string) => void = (l) => console.log(l)): Logger {
  const lines: string[] = [];
  const write = (lvl: Level, event: string, fields: Record<string, unknown> = {}) => {
    if (ORDER[lvl] < ORDER[level]) return;
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!ALLOWED_FIELDS.has(k)) continue;
      if (typeof v === 'string') safe[k] = v.slice(0, 80);
      else if (typeof v === 'number' || typeof v === 'boolean') safe[k] = v;
    }
    const line = JSON.stringify({ t: new Date().toISOString(), lvl, event, ...safe });
    lines.push(line);
    if (lines.length > 2000) lines.shift();
    sink(line);
  };
  return {
    debug: (e, f) => write('debug', e, f),
    info: (e, f) => write('info', e, f),
    warn: (e, f) => write('warn', e, f),
    error: (e, f) => write('error', e, f),
    lines
  };
}
