// Persistenz der Recherche: Spieler, Identitäten, Beobachtungen mit Provenienz,
// veröffentlichte Werte, Config-Artefakte und Änderungsereignisse.

import { createHash } from 'node:crypto';
import { all, get, nowIso, run, tx, type Db } from '../db.ts';
import { reconcile, type Decision, type Origin } from './reconcile.ts';
import { validateCandidate, type Candidate } from './validate.ts';
import type { ChangeEventDto, ConfigArtifactDto, CoverageDto, FieldValueDto, PlayerDto } from '../../src/core/models.ts';

export interface IdentityInput {
  platform: string;
  handle: string;
  url?: string | null;
  evidenceUrl: string;
  linkType: 'wiki-listed' | 'self-declared' | 'api-id';
}

export const normHandle = (h: string) => h.trim().toLowerCase();

export function findPlayerByIdentity(db: Db, platform: string, handle: string): string | null {
  return get<{ player_id: string }>(db, 'SELECT player_id FROM identities WHERE platform = ? AND handle_norm = ?', platform, normHandle(handle))?.player_id ?? null;
}

const CAT_RANK: Record<string, number> = { unbekannt: 0, 'high-rank': 1, pro: 2 };

/**
 * Legt einen Spieler an oder findet ihn – ausschließlich über eine stabile Identität (Plattform + ID/Handle).
 * Gleiche Anzeigenamen auf verschiedenen Plattformen werden NICHT zusammengeführt.
 */
export function upsertPlayer(
  db: Db,
  p: { displayName: string; category: 'pro' | 'high-rank' | 'unbekannt'; categoryEvidence: string; identity: IdentityInput; isDemo?: boolean },
): { playerId: string; created: boolean } {
  return tx(db, () => {
    const existing = findPlayerByIdentity(db, p.identity.platform, p.identity.handle);
    const now = nowIso();
    if (existing) {
      const cur = get<{ category: string; aliases: string; display_name: string }>(db, 'SELECT category, aliases, display_name FROM players WHERE id = ?', existing)!;
      const aliases = new Set<string>(JSON.parse(cur.aliases));
      if (p.displayName !== cur.display_name) aliases.add(p.displayName);
      if (CAT_RANK[p.category] > CAT_RANK[cur.category]) {
        run(db, 'UPDATE players SET category = ?, category_evidence = ? WHERE id = ?', p.category, p.categoryEvidence, existing);
      } else if (p.category === cur.category) {
        run(db, 'UPDATE players SET category_evidence = ? WHERE id = ?', p.categoryEvidence, existing);
      }
      run(db, 'UPDATE players SET aliases = ?, last_refreshed_at = ? WHERE id = ?', JSON.stringify([...aliases]), now, existing);
      return { playerId: existing, created: false };
    }
    const id = 'pl_' + createHash('sha256').update(`${p.identity.platform}:${normHandle(p.identity.handle)}`).digest('hex').slice(0, 16);
    run(
      db,
      'INSERT INTO players(id, display_name, aliases, category, category_evidence, first_seen_at, last_refreshed_at, is_demo) VALUES (?,?,?,?,?,?,?,?)',
      id,
      p.displayName,
      '[]',
      p.category,
      p.categoryEvidence,
      now,
      now,
      p.isDemo ? 1 : 0,
    );
    run(
      db,
      'INSERT INTO identities(player_id, platform, handle, handle_norm, url, evidence_url, link_type) VALUES (?,?,?,?,?,?,?)',
      id,
      p.identity.platform,
      p.identity.handle,
      normHandle(p.identity.handle),
      p.identity.url ?? null,
      p.identity.evidenceUrl,
      p.identity.linkType,
    );
    return { playerId: id, created: true };
  });
}

/** Verknüpft eine weitere belegte Identität. Gehört sie schon einem anderen Spieler, wird nichts umgehängt. */
export function linkIdentity(db: Db, playerId: string, id: IdentityInput): 'linked' | 'exists' | 'conflict' {
  const owner = findPlayerByIdentity(db, id.platform, id.handle);
  if (owner === playerId) return 'exists';
  if (owner) return 'conflict';
  run(
    db,
    'INSERT INTO identities(player_id, platform, handle, handle_norm, url, evidence_url, link_type) VALUES (?,?,?,?,?,?,?)',
    playerId,
    id.platform,
    id.handle,
    normHandle(id.handle),
    id.url ?? null,
    id.evidenceUrl,
    id.linkType,
  );
  return 'linked';
}

/** Findet den Spieler, dem eine URL nachweislich gehört (Kanal/Website/Repo in einer belegten Identität). */
export function playerForUrl(db: Db, url: string): string | null {
  const u = safeUrl(url);
  if (!u) return null;
  const rows = all<{ player_id: string; url: string | null }>(db, 'SELECT player_id, url FROM identities WHERE url IS NOT NULL');
  for (const r of rows) {
    const iu = safeUrl(r.url!);
    if (!iu) continue;
    if (iu.hostname.replace(/^www\./, '') !== u.hostname.replace(/^www\./, '')) continue;
    const ip = iu.pathname.replace(/\/+$/, '').toLowerCase();
    const up = u.pathname.toLowerCase();
    if (ip === '' ? up === '' || up === '/' || !['github.com', 'twitch.tv', 'youtube.com', 'x.com', 'twitter.com'].includes(u.hostname.replace(/^www\./, '')) : up === ip || up.startsWith(ip + '/')) return r.player_id;
  }
  return null;
}

function safeUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

export interface ObservationInput extends Candidate {
  playerId: string | null;
  playerHint?: string | null;
  sourceId: string;
  sourceUrl: string;
  sourceType: 'primary' | 'third-party' | 'manual';
  origin: Origin;
  retrievedAt: string;
  extractorVersion: string;
  contentHash: string;
}

export interface RecordResult {
  decision: Decision;
  observationId: number | null;
}

/** Validiert, gleicht ab und speichert eine Beobachtung. Wiederholte gleiche Beobachtungen erzeugen keine Duplikate. */
export function recordObservation(db: Db, o: ObservationInput): RecordResult {
  const v = validateCandidate(o);
  const context = v.context ?? '';
  return tx(db, () => {
    const now = nowIso();
    const cur = o.playerId
      ? get<{ id: number; value: string; origin: Origin; source_url: string; published_at: string | null }>(
          db,
          `SELECT o.id, o.value, o.origin, o.source_url, o.published_at FROM current_fields c JOIN observations o ON o.id = c.observation_id WHERE c.player_id = ? AND c.field = ? AND c.context = ?`,
          o.playerId,
          o.field,
          context,
        )
      : undefined;
    const decision = reconcile(
      cur ? { value: cur.value, origin: cur.origin, sourceUrl: cur.source_url, publishedAt: cur.published_at, validation: 'valid' } : null,
      { value: v.normalizedValue, origin: o.origin, sourceUrl: o.sourceUrl, publishedAt: v.publishedAt ?? null, validation: v.validation },
      Boolean(o.playerId),
    );
    const status = decision.action === 'publish' || decision.action === 'confirm' ? 'published' : decision.action === 'reject' ? 'rejected' : decision.action === 'conflict' ? 'conflict' : 'candidate';
    const existing = get<{ id: number }>(
      db,
      `SELECT id FROM observations WHERE ifnull(player_id,'') = ? AND ifnull(player_hint,'') = ? AND field = ? AND context = ? AND source_url = ? AND value = ?`,
      o.playerId ?? '',
      o.playerHint ?? '',
      o.field,
      context,
      o.sourceUrl,
      v.normalizedValue,
    );
    let obsId: number;
    if (existing) {
      run(db, 'UPDATE observations SET last_seen_at = ?, content_hash = ?, evidence = ?, extractor_version = ? WHERE id = ?', now, o.contentHash, v.evidence.slice(0, 500), o.extractorVersion, existing.id);
      if (decision.action !== 'confirm') run(db, 'UPDATE observations SET status = ?, reason = ?, validation = ? WHERE id = ?', status, v.reason ?? decision.reason, v.validation, existing.id);
      obsId = existing.id;
    } else {
      const r = run(
        db,
        `INSERT INTO observations(player_id, player_hint, field, context, value, unit, source_id, source_url, source_type, evidence, retrieved_at, last_seen_at, published_at, extractor_version, validation, origin, content_hash, status, reason)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        o.playerId,
        o.playerHint ?? null,
        o.field,
        context,
        v.normalizedValue,
        v.unit ?? null,
        o.sourceId,
        o.sourceUrl,
        o.sourceType,
        v.evidence.slice(0, 500),
        o.retrievedAt,
        now,
        v.publishedAt ?? null,
        o.extractorVersion,
        v.validation,
        o.origin,
        o.contentHash,
        status,
        v.reason ?? decision.reason,
      );
      obsId = Number(r.lastInsertRowid);
    }
    if (decision.action === 'publish' && o.playerId) {
      if (cur) run(db, "UPDATE observations SET status = 'superseded' WHERE id = ?", cur.id);
      run(
        db,
        'INSERT INTO current_fields(player_id, field, context, observation_id) VALUES (?,?,?,?) ON CONFLICT(player_id, field, context) DO UPDATE SET observation_id = excluded.observation_id',
        o.playerId,
        o.field,
        context,
        obsId,
      );
      run(
        db,
        'INSERT INTO change_events(at, player_id, field, old_value, new_value, source_url, kind) VALUES (?,?,?,?,?,?,?)',
        now,
        o.playerId,
        context && context !== 'ingame' ? `${o.field}:${context}` : o.field,
        cur?.value ?? null,
        v.normalizedValue,
        o.sourceUrl,
        decision.kind,
      );
    }
    return { decision, observationId: obsId };
  });
}

/** Eine zuvor genutzte Quelle ist verschwunden (404/410). Werte bleiben, Ereignis wird protokolliert. */
export function markSourceGone(db: Db, url: string): number {
  const rows = all<{ id: number; player_id: string | null; field: string; value: string }>(db, "SELECT id, player_id, field, value FROM observations WHERE source_url = ? AND status = 'published'", url);
  const already = get(db, "SELECT id FROM change_events WHERE source_url = ? AND kind = 'source-gone'", url);
  if (!rows.length || already) return 0;
  tx(db, () => {
    for (const r of rows) {
      run(db, "UPDATE observations SET reason = 'Quelle nicht mehr erreichbar (Wert bleibt bis zu neuer Beobachtung)' WHERE id = ?", r.id);
    }
    run(db, 'INSERT INTO change_events(at, player_id, field, old_value, new_value, source_url, kind) VALUES (?,?,?,?,?,?,?)', nowIso(), rows[0].player_id, rows.map((r) => r.field).join(','), null, null, url, 'source-gone');
  });
  return rows.length;
}

export function recordArtifact(db: Db, a: Omit<ConfigArtifactDto, 'id'> & { sourceId: string; playerId: string | null; body: string }): { id: string; changed: boolean } {
  const id = 'ca_' + createHash('sha256').update(a.url).digest('hex').slice(0, 16);
  const prev = get<{ sha256: string }>(db, 'SELECT sha256 FROM config_artifacts WHERE url = ?', a.url);
  run(
    db,
    `INSERT INTO config_artifacts(id, url, source_id, file_name, kind, sha256, size, retrieved_at, attribution, license, relation, player_id, supported, not_adopted, body)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(url) DO UPDATE SET sha256=excluded.sha256, size=excluded.size, retrieved_at=excluded.retrieved_at, supported=excluded.supported, not_adopted=excluded.not_adopted, body=excluded.body, license=excluded.license, relation=excluded.relation, player_id=excluded.player_id`,
    id,
    a.url,
    a.sourceId,
    a.fileName,
    a.kind,
    a.sha256,
    a.size,
    a.retrievedAt,
    a.attribution,
    a.license,
    a.relation,
    a.playerId,
    JSON.stringify(a.supportedValues),
    JSON.stringify(a.notAdopted),
    a.body,
  );
  const changed = Boolean(prev && prev.sha256 !== a.sha256);
  if (changed) run(db, 'INSERT INTO change_events(at, player_id, field, old_value, new_value, source_url, kind) VALUES (?,?,?,?,?,?,?)', nowIso(), a.playerId, `config:${a.fileName}`, prev!.sha256.slice(0, 12), a.sha256.slice(0, 12), a.url, 'changed');
  return { id, changed };
}

// ---------------------------------------------------------------- DTOs

type ObsRow = {
  field: string;
  context: string;
  value: string;
  unit: string | null;
  origin: FieldValueDto['origin'];
  source_url: string;
  source_type: FieldValueDto['sourceType'];
  evidence: string;
  retrieved_at: string;
  last_seen_at: string;
  published_at: string | null;
  extractor_version: string;
  validation: FieldValueDto['validation'];
  reason: string | null;
};

export function playerDto(db: Db, id: string): PlayerDto | null {
  const p = get<{ id: string; display_name: string; aliases: string; category: PlayerDto['category']; category_evidence: string; first_seen_at: string; last_refreshed_at: string | null; is_demo: number }>(
    db,
    'SELECT * FROM players WHERE id = ?',
    id,
  );
  if (!p) return null;
  const identities = all<{ platform: string; handle: string; url: string | null; evidence_url: string; link_type: PlayerDto['identities'][number]['linkType'] }>(db, 'SELECT platform, handle, url, evidence_url, link_type FROM identities WHERE player_id = ?', id);
  const fields = all<ObsRow>(db, 'SELECT o.* FROM current_fields c JOIN observations o ON o.id = c.observation_id WHERE c.player_id = ? ORDER BY o.field', id);
  const conflicts = all<ObsRow>(db, "SELECT * FROM observations WHERE player_id = ? AND status = 'conflict'", id);
  const arts = all<Record<string, string | number>>(db, 'SELECT * FROM config_artifacts WHERE player_id = ?', id);
  const byField = new Map<string, PlayerDto['conflicts'][number]>();
  for (const c of conflicts) {
    const k = c.context ? `${c.field}:${c.context}` : c.field;
    const e = byField.get(k) || { field: k, candidates: [] };
    e.candidates.push({ value: c.value, sourceUrl: c.source_url, reason: c.reason || '' });
    byField.set(k, e);
  }
  return {
    id: p.id,
    displayName: p.display_name,
    aliases: JSON.parse(p.aliases),
    category: p.category,
    categoryEvidence: p.category_evidence,
    identities: identities.map((i) => ({ platform: i.platform, handle: i.handle, url: i.url, evidenceUrl: i.evidence_url, linkType: i.link_type })),
    fields: fields.map((f) => ({
      field: f.field,
      value: f.value,
      unit: f.unit,
      context: f.context || null,
      origin: f.origin,
      sourceUrl: f.source_url,
      sourceType: f.source_type,
      evidence: f.evidence,
      retrievedAt: f.last_seen_at,
      publishedAt: f.published_at,
      extractorVersion: f.extractor_version,
      validation: f.validation,
      playerConfirmedAt: f.origin === 'auto-primary' ? f.published_at : null,
    })),
    conflicts: [...byField.values()],
    configArtifacts: arts.map(artifactDto),
    firstSeenAt: p.first_seen_at,
    lastRefreshedAt: p.last_refreshed_at,
    isDemo: p.is_demo === 1,
  };
}

export function artifactDto(r: Record<string, string | number>): ConfigArtifactDto {
  return {
    id: String(r.id),
    url: String(r.url),
    fileName: String(r.file_name),
    kind: String(r.kind),
    sha256: String(r.sha256),
    size: Number(r.size),
    retrievedAt: String(r.retrieved_at),
    attribution: String(r.attribution),
    license: (r.license as string) ?? null,
    relation: r.relation as ConfigArtifactDto['relation'],
    supportedValues: JSON.parse(String(r.supported)),
    notAdopted: JSON.parse(String(r.not_adopted)),
  };
}

export function listPlayers(db: Db, opts: { includeDemo: boolean; q?: string; category?: string; limit: number; offset: number }): PlayerDto[] {
  const params: (string | number)[] = [];
  let where = opts.includeDemo ? '1=1' : 'is_demo = 0';
  if (opts.category) {
    where += ' AND category = ?';
    params.push(opts.category);
  }
  if (opts.q) {
    where += ' AND (lower(display_name) LIKE ? OR lower(aliases) LIKE ?)';
    params.push(`%${opts.q.toLowerCase()}%`, `%${opts.q.toLowerCase()}%`);
  }
  const ids = all<{ id: string }>(
    db,
    `SELECT id FROM players WHERE ${where} ORDER BY (SELECT count(*) FROM current_fields c WHERE c.player_id = players.id) DESC, CASE category WHEN 'pro' THEN 0 WHEN 'high-rank' THEN 1 ELSE 2 END, display_name LIMIT ? OFFSET ?`,
    ...params,
    opts.limit,
    opts.offset,
  );
  return ids.map((r) => playerDto(db, r.id)!).filter(Boolean);
}

export function changesSince(db: Db, sinceId: number, playerIds?: string[]): ChangeEventDto[] {
  const rows = playerIds?.length
    ? all<Record<string, string | number | null>>(db, `SELECT * FROM change_events WHERE id > ? AND player_id IN (${playerIds.map(() => '?').join(',')}) ORDER BY id LIMIT 500`, sinceId, ...playerIds)
    : all<Record<string, string | number | null>>(db, 'SELECT * FROM change_events WHERE id > ? ORDER BY id LIMIT 500', sinceId);
  return rows.map((r) => ({
    id: Number(r.id),
    at: String(r.at),
    playerId: (r.player_id as string) ?? null,
    field: String(r.field),
    oldValue: (r.old_value as string) ?? null,
    newValue: (r.new_value as string) ?? null,
    sourceUrl: String(r.source_url),
    kind: r.kind as ChangeEventDto['kind'],
  }));
}

export function coverage(db: Db, flags: { searchActive: boolean; aiActive: boolean }, includeDemo: boolean): CoverageDto {
  const demo = includeDemo ? '' : 'WHERE is_demo = 0';
  const pc = get<{ total: number; pro: number; hr: number }>(db, `SELECT count(*) total, sum(category='pro') pro, sum(category='high-rank') hr FROM players ${demo}`)!;
  const withAny = get<{ n: number }>(db, `SELECT count(DISTINCT c.player_id) n FROM current_fields c JOIN players p ON p.id = c.player_id ${includeDemo ? '' : 'WHERE p.is_demo = 0'}`)!;
  const fields: Record<string, number> = {};
  for (const r of all<{ field: string; n: number }>(db, `SELECT c.field, count(*) n FROM current_fields c JOIN players p ON p.id = c.player_id ${includeDemo ? '' : 'WHERE p.is_demo = 0'} GROUP BY c.field`)) fields[r.field] = r.n;
  const sources = all<{ id: string; name: string; status: string; last_success_at: string | null; last_error: string | null; enabled: number; terms_note: string | null }>(db, 'SELECT * FROM sources ORDER BY id');
  const last = get<{ t: string | null }>(db, 'SELECT max(last_success_at) t FROM sources')!;
  return {
    generatedAt: nowIso(),
    players: { total: pc.total, pro: pc.pro ?? 0, highRank: pc.hr ?? 0, withAnyField: withAny.n },
    fields,
    sources: sources.map((s) => ({ id: s.id, name: s.name, status: s.status, lastSuccessAt: s.last_success_at, lastError: s.last_error, enabled: s.enabled === 1, reason: s.terms_note ?? undefined })),
    lastSuccessfulUpdate: last.t,
    searchActive: flags.searchActive,
    aiActive: flags.aiActive,
  };
}
