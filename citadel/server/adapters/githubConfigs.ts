// Echte veröffentlichte Config-Dateien aus GitHub-Repositories.
// - Konfigurierte Repos (z. B. Community-Presets wie OptiLock) → relation 'community-preset'
// - Repos von Spielern, deren GitHub-Konto belegt verknüpft ist → relation 'player-original'
// Nur Textdateien (video.txt, gameinfo.gi, *.cfg) bis 512 KB; es wird nichts ausgeführt.

import { createHash } from 'node:crypto';
import type { Adapter, AdapterContext } from './types.ts';
import { detectKind, explainConfig, readValues } from '../../src/core/config.ts';
import { findSetting, VIDEO_DEVICE_KEYS } from '../../src/core/catalog.ts';
import { recordArtifact, recordObservation } from '../pipeline/store.ts';
import { extractByRules, EXTRACTOR_VERSION } from '../extract/rules.ts';
import { all } from '../db.ts';

interface RepoSpec {
  owner: string;
  repo: string;
  ref?: string;
  relation: 'community-preset' | 'player-original';
  attribution: string;
  playerId?: string | null;
  exclude?: string[];
}

const MAX_FILE = 512 * 1024;
const MAX_FILES_PER_REPO = 40;

function ghHeaders(ctx: AdapterContext): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  if (ctx.cfg.githubToken) h.authorization = `Bearer ${ctx.cfg.githubToken}`;
  return h;
}

export function isConfigPath(path: string): boolean {
  const base = path.split('/').pop()!.toLowerCase();
  return base === 'video.txt' || base === 'gameinfo.gi' || base.endsWith('.cfg');
}

export async function processRepo(ctx: AdapterContext, spec: RepoSpec, minIntervalMs: number) {
  const api = String(ctx.sourceConfig.apiBase || 'https://api.github.com');
  const raw = String(ctx.sourceConfig.rawBase || 'https://raw.githubusercontent.com');
  const { data: repo } = await ctx.fetcher.json<{ default_branch: string; license?: { spdx_id?: string } | null; html_url: string }>(`${api}/repos/${spec.owner}/${spec.repo}`, { headers: ghHeaders(ctx), minIntervalMs });
  const ref = spec.ref || repo.default_branch;
  const { data: tree } = await ctx.fetcher.json<{ tree: { path: string; type: string; size?: number; sha: string }[]; truncated?: boolean }>(`${api}/repos/${spec.owner}/${spec.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`, {
    headers: ghHeaders(ctx),
    minIntervalMs,
  });
  const files = tree.tree.filter((t) => t.type === 'blob' && isConfigPath(t.path) && (t.size ?? 0) <= MAX_FILE && !(spec.exclude || []).some((x) => t.path.startsWith(x))).slice(0, MAX_FILES_PER_REPO);
  let artifacts = 0;
  let changed = 0;
  let observations = 0;
  for (const f of files) {
    const url = `${raw}/${spec.owner}/${spec.repo}/${ref}/${f.path.split('/').map(encodeURIComponent).join('/')}`;
    const res = await ctx.fetcher.fetch(url, { minIntervalMs, allowedTypes: /^(text\/|application\/octet-stream)/i, maxBytes: MAX_FILE });
    const text = res.body;
    if (text.includes('\u0000')) continue; // keine Binärdateien
    const kind = detectKind(f.path, text);
    if (!kind) continue;
    // Änderungsdatum der Datei = letzter Commit, der sie berührt (belegtes Datum, nicht Abrufdatum)
    let publishedAt: string | null = null;
    try {
      const { data: commits } = await ctx.fetcher.json<{ commit: { committer: { date: string } } }[]>(`${api}/repos/${spec.owner}/${spec.repo}/commits?path=${encodeURIComponent(f.path)}&per_page=1&sha=${encodeURIComponent(ref)}`, {
        headers: ghHeaders(ctx),
        minIntervalMs,
      });
      publishedAt = commits[0]?.commit.committer.date ?? null;
    } catch {
      publishedAt = null;
    }
    const ex = explainConfig(kind, text);
    const supported: Record<string, string> = {};
    for (const k of ex.known) {
      const def = findSetting(kind, k.key);
      if (def && def.portable) supported[def.id] = k.value;
    }
    const notAdopted = [...ex.unknown.map((u) => `${u.key} (unbekannt)`), ...ex.device.map((d) => `${d} (gerätespezifisch)`)];
    const sha256 = createHash('sha256').update(text).digest('hex');
    const r = recordArtifact(ctx.db, {
      sourceId: ctx.source.id,
      url,
      fileName: f.path,
      kind,
      sha256,
      size: Buffer.byteLength(text),
      retrievedAt: res.fetchedAt,
      attribution: spec.attribution,
      license: repo.license?.spdx_id ?? null,
      relation: spec.relation,
      playerId: spec.playerId ?? null,
      supportedValues: supported,
      notAdopted,
      body: text,
    });
    artifacts++;
    if (r.changed) changed++;
    // Nur bei belegter Spielerzuordnung werden daraus Spielerwerte (Primärquelle).
    if (spec.relation === 'player-original' && spec.playerId) {
      const cands = kind === 'autoexec.cfg' ? extractByRules(text, { isConfigFile: true, publishedAt }) : [];
      if (kind === 'video.txt') {
        for (const [k, e] of readValues('video.txt', text)) {
          if (VIDEO_DEVICE_KEYS.some((d) => d.toLowerCase() === k)) continue;
          const def = findSetting('video.txt', k);
          if (!def || !def.portable) continue;
          cands.push({ field: `video.${def.key.slice('setting.'.length)}`, value: e.value, evidence: `${f.path}, Zeile ${e.line}: "${e.key}" "${e.value}"`, gameConfirmed: true, publishedAt });
        }
      }
      for (const c of cands) {
        recordObservation(ctx.db, {
          ...c,
          playerId: spec.playerId,
          sourceId: ctx.source.id,
          sourceUrl: url,
          sourceType: 'primary',
          origin: 'auto-primary',
          retrievedAt: res.fetchedAt,
          extractorVersion: EXTRACTOR_VERSION,
          contentHash: res.contentHash,
        });
        observations++;
      }
    }
  }
  return { artifacts, changed, observations, files: files.length };
}

export const githubConfigs: Adapter = {
  id: 'github-configs',
  description: 'Veröffentlichte Config-Dateien aus GitHub-Repositories (konfigurierte Presets + belegte Spieler-Konten)',
  terms: 'GitHub REST API (ohne Token 60 Anfragen/h, mit GITHUB_TOKEN 5000/h). Lizenz jedes Repos wird gespeichert und angezeigt; Attribution erforderlich.',
  minIntervalMs: 1000,
  missingRequirement: () => null,
  async run(ctx) {
    const specs: RepoSpec[] = [...((ctx.sourceConfig.repos as RepoSpec[]) || [])];
    // Belegte GitHub-Identitäten von Spielern → deren Repos mit "deadlock" im Namen prüfen
    const ids = all<{ player_id: string; handle: string }>(ctx.db, "SELECT player_id, handle FROM identities WHERE platform = 'github'");
    for (const id of ids) {
      try {
        const api = String(ctx.sourceConfig.apiBase || 'https://api.github.com');
        const { data: repos } = await ctx.fetcher.json<{ name: string; owner: { login: string }; fork: boolean }[]>(`${api}/users/${encodeURIComponent(id.handle)}/repos?per_page=100&sort=updated`, {
          headers: ghHeaders(ctx),
          minIntervalMs: this.minIntervalMs,
        });
        for (const r of repos.filter((x) => !x.fork && /deadlock|citadel/i.test(x.name)).slice(0, 5)) {
          specs.push({ owner: r.owner.login, repo: r.name, relation: 'player-original', attribution: `${r.owner.login}/${r.name}`, playerId: id.player_id });
        }
      } catch (e) {
        ctx.log(`GitHub-Konto ${id.handle}: ${(e as Error).message}`);
      }
    }
    let a = 0;
    let c = 0;
    let o = 0;
    for (const s of specs) {
      const r = await processRepo(ctx, s, this.minIntervalMs);
      a += r.artifacts;
      c += r.changed;
      o += r.observations;
    }
    return { summary: `${specs.length} Repos, ${a} Config-Dateien geprüft, ${c} geändert, ${o} Spielerwerte`, stats: { repos: specs.length, artifacts: a, changed: c, observations: o } };
  },
};
