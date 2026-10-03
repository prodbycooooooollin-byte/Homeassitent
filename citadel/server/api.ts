// Versionierte, lesende öffentliche API (v1) + schmale, per Token geschützte Betreiber-Endpunkte.

import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { all, get, type Db } from './db.ts';
import type { ServerConfig } from './config.ts';
import { artifactDto, changesSince, coverage, listPlayers, playerDto } from './pipeline/store.ts';
import { enqueue } from './jobs.ts';

export const API_VERSION = 'v1';

function json(res: http.ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  const s = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff', ...extra });
  res.end(s);
}

function adminOk(req: http.IncomingMessage, cfg: ServerConfig): boolean {
  if (!cfg.adminToken) return false;
  const h = String(req.headers.authorization || '');
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const a = Buffer.from(tok);
  const b = Buffer.from(cfg.adminToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function searchActive(db: Db, cfg: ServerConfig): boolean {
  if (!cfg.braveKey) return false;
  const s = get<{ last_success_at: string | null; interval_hours: number; status: string }>(db, "SELECT last_success_at, interval_hours, status FROM sources WHERE adapter = 'brave-search' AND enabled = 1");
  if (!s?.last_success_at || s.status !== 'ok') return false;
  return Date.now() - Date.parse(s.last_success_at) < 2 * s.interval_hours * 3600_000;
}

export function createApi(db: Db, cfg: ServerConfig) {
  return http.createServer((req, res) => {
    const origin = String(req.headers.origin || '');
    const cors: Record<string, string> = cfg.corsOrigins.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'authorization, content-type' });
      return res.end();
    }
    const url = new URL(req.url || '/', 'http://x');
    const p = url.pathname.replace(/\/+$/, '');
    const includeDemo = cfg.demo && url.searchParams.get('demo') === '1';
    try {
      if (req.method === 'GET' && p === '/v1/status') {
        return json(res, 200, { api: API_VERSION, coverage: coverage(db, { searchActive: searchActive(db, cfg), aiActive: cfg.anthropicKey }, includeDemo) }, cors);
      }
      if (req.method === 'GET' && p === '/v1/players') {
        const limit = Math.min(200, Number(url.searchParams.get('limit') || 50));
        const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
        const players = listPlayers(db, { includeDemo, q: url.searchParams.get('q') || undefined, category: url.searchParams.get('category') || undefined, limit, offset });
        return json(res, 200, { players }, cors);
      }
      const pm = /^\/v1\/players\/([\w-]+)$/.exec(p);
      if (req.method === 'GET' && pm) {
        const d = playerDto(db, pm[1]);
        if (!d || (d.isDemo && !includeDemo)) return json(res, 404, { error: 'Spieler nicht gefunden' }, cors);
        return json(res, 200, d, cors);
      }
      if (req.method === 'GET' && p === '/v1/changes') {
        const since = Number(url.searchParams.get('since') || 0);
        const ids = (url.searchParams.get('players') || '').split(',').filter((x) => /^[\w-]+$/.test(x)).slice(0, 100);
        return json(res, 200, { changes: changesSince(db, since, ids.length ? ids : undefined) }, cors);
      }
      if (req.method === 'GET' && p === '/v1/config-artifacts') {
        const rows = all<Record<string, string | number>>(db, 'SELECT id, url, file_name, kind, sha256, size, retrieved_at, attribution, license, relation, player_id, supported, not_adopted FROM config_artifacts ORDER BY file_name');
        return json(res, 200, { artifacts: rows.map((r) => ({ ...artifactDto(r), playerId: r.player_id ?? null })) }, cors);
      }
      const am = /^\/v1\/config-artifacts\/([\w-]+)\/raw$/.exec(p);
      if (req.method === 'GET' && am) {
        const r = get<{ body: string; file_name: string }>(db, 'SELECT body, file_name FROM config_artifacts WHERE id = ?', am[1]);
        if (!r) return json(res, 404, { error: 'nicht gefunden' }, cors);
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff', ...cors });
        return res.end(r.body);
      }
      if (req.method === 'GET' && p === '/v1/sources') {
        return json(res, 200, { sources: coverage(db, { searchActive: searchActive(db, cfg), aiActive: cfg.anthropicKey }, false).sources }, cors);
      }
      // ---------------- Betreiber (nur Ausnahmen, Token erforderlich)
      if (p.startsWith('/v1/admin/')) {
        if (!adminOk(req, cfg)) return json(res, 401, { error: 'Admin-Token erforderlich' }, cors);
        if (req.method === 'GET' && p === '/v1/admin/exceptions') {
          const candidates = all(db, "SELECT id, player_id, player_hint, field, context, value, source_url, evidence, reason, status, retrieved_at FROM observations WHERE status IN ('candidate','conflict','rejected') ORDER BY id DESC LIMIT 300");
          const failedJobs = all(db, "SELECT id, source_id, kind, payload, attempts, last_error, finished_at FROM crawl_jobs WHERE status = 'failed' ORDER BY id DESC LIMIT 100");
          const aiSpend = all(db, "SELECT substr(at,1,10) day, sum(cost_usd) usd, count(*) calls FROM ai_usage GROUP BY day ORDER BY day DESC LIMIT 14");
          return json(res, 200, { candidates, failedJobs, aiSpend }, { ...cors, 'cache-control': 'no-store' });
        }
        const rm = /^\/v1\/admin\/sources\/([\w-]+)\/run$/.exec(p);
        if (req.method === 'POST' && rm) {
          const ok = enqueue(db, rm[1], 'source', {}, `source:${rm[1]}`);
          return json(res, 202, { queued: ok }, { ...cors, 'cache-control': 'no-store' });
        }
      }
      if (p === '' || p === '/health') return json(res, 200, { ok: true, api: API_VERSION }, cors);
      return json(res, 404, { error: 'Unbekannter Endpunkt' }, cors);
    } catch (e) {
      console.error('[api]', e);
      return json(res, 500, { error: 'Interner Fehler' }, cors);
    }
  });
}
