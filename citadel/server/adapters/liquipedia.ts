// Profi-Entdeckung und Identitätszuordnung über die Liquipedia-MediaWiki-API (liquipedia.net/deadlock/api.php).
// Nutzungsbedingungen (Liquipedia API Terms of Use): höchstens 1 Anfrage / 2 s, action=parse höchstens 1 / 30 s,
// eigener User-Agent mit Kontakt, gzip akzeptieren; Inhalte CC-BY-SA 3.0 – Liquipedia als Quelle nennen.
// Automatischer Abruf generierter HTML-Seiten ist nicht erlaubt – daher nur api.php (query/revisions).
//
// Kriterium „pro“: Infobox player mit eingetragenem aktuellem Team und nicht als inaktiv/zurückgetreten markiert.

import type { Adapter } from './types.ts';
import { findPlayerByIdentity, linkIdentity, upsertPlayer } from '../pipeline/store.ts';
import { get, run, type Db } from '../db.ts';

export interface InfoboxPlayer {
  id?: string;
  name?: string;
  team?: string;
  status?: string;
  twitch?: string;
  youtube?: string;
  twitter?: string;
  homepage?: string;
  steam?: string;
  ids?: string;
}

/** Parst die Parameter der ersten {{Infobox player ...}} (verschachtelte Vorlagen werden übersprungen). */
export function parseInfobox(wikitext: string): InfoboxPlayer | null {
  const start = wikitext.search(/\{\{\s*Infobox[ _]player/i);
  if (start < 0) return null;
  let depth = 0;
  let i = start;
  let end = -1;
  for (; i < wikitext.length - 1; i++) {
    if (wikitext[i] === '{' && wikitext[i + 1] === '{') {
      depth++;
      i++;
    } else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
      depth--;
      i++;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  const body = wikitext.slice(start + 2, end > 0 ? end - 2 : undefined);
  const params: Record<string, string> = {};
  let d = 0;
  let cur = '';
  const parts: string[] = [];
  for (let k = 0; k < body.length; k++) {
    const two = body.slice(k, k + 2);
    if (two === '{{' || two === '[[') {
      d++;
      cur += two;
      k++;
      continue;
    }
    if ((two === '}}' || two === ']]') && d > 0) {
      d--;
      cur += two;
      k++;
      continue;
    }
    if (body[k] === '|' && d === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += body[k];
  }
  parts.push(cur);
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    const v = p
      .slice(eq + 1)
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
    if (v) params[k] = v;
  }
  return params as InfoboxPlayer;
}

const STEAM64_BASE = 76561197960265728n;

export function steamAccountId(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{5,20})/.exec(raw);
  if (!m) return null;
  const n = BigInt(m[1]);
  if (n > STEAM64_BASE) return String(n - STEAM64_BASE);
  return n < 2n ** 32n ? String(n) : null;
}

export function isActivePro(ib: InfoboxPlayer): boolean {
  if (!ib.team) return false;
  return !/retired|inactive|banned|deceased/i.test(ib.status || '');
}

export function channelUrl(platform: 'twitch' | 'youtube' | 'twitter', v: string): string | null {
  const s = v.trim();
  if (!/^[\w@.\-/]+$/.test(s)) return null;
  if (platform === 'twitch') return `https://www.twitch.tv/${s.replace(/^.*twitch\.tv\//, '')}`;
  if (platform === 'twitter') return `https://x.com/${s.replace(/^.*(twitter|x)\.com\//, '')}`;
  const yt = s.replace(/^.*youtube\.com\//, '');
  return `https://www.youtube.com/${yt.startsWith('@') || yt.startsWith('channel/') || yt.startsWith('c/') ? yt : '@' + yt}`;
}

function pageUrl(base: string, title: string) {
  return `${base.replace(/\/api\.php$/, '')}/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

export const liquipedia: Adapter = {
  id: 'liquipedia',
  description: 'Profispieler (aktive Teams) und belegte Kanal-Verlinkungen aus Liquipedia Deadlock',
  terms: 'Liquipedia API Terms of Use: ≤1 Anfrage/2 s, eigener User-Agent mit Kontakt, gzip; Inhalte CC-BY-SA 3.0 (Attribution „Liquipedia“). Kein HTML-Scraping.',
  minIntervalMs: 2100,
  missingRequirement: (cfg) => (/\(.*(@|https?:)/.test(cfg.userAgent) ? null : 'CITADEL_USER_AGENT muss Kontaktangabe enthalten (Liquipedia-Bedingung)'),
  async run(ctx) {
    const api = String(ctx.sourceConfig.apiUrl || 'https://liquipedia.net/deadlock/api.php');
    const category = String(ctx.sourceConfig.category || 'Category:Players');
    const titles: string[] = [];
    let cont: string | undefined;
    do {
      const url = `${api}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(category)}&cmnamespace=0&cmlimit=500&format=json${cont ? `&cmcontinue=${encodeURIComponent(cont)}` : ''}`;
      const { data } = await ctx.fetcher.json<{ query?: { categorymembers?: { title: string }[] }; continue?: { cmcontinue?: string } }>(url, { minIntervalMs: this.minIntervalMs });
      for (const m of data.query?.categorymembers || []) titles.push(m.title);
      cont = data.continue?.cmcontinue;
    } while (cont && titles.length < 5000);

    let pros = 0;
    let skipped = 0;
    let links = 0;
    let conflicts = 0;
    for (let b = 0; b < titles.length; b += 50) {
      const batch = titles.slice(b, b + 50);
      const url = `${api}?action=query&prop=revisions&rvprop=content|timestamp&rvslots=main&format=json&formatversion=2&titles=${encodeURIComponent(batch.join('|'))}`;
      const { data } = await ctx.fetcher.json<{ query?: { pages?: { title: string; missing?: boolean; revisions?: { timestamp: string; slots: { main: { content: string } } }[] }[] } }>(url, {
        minIntervalMs: this.minIntervalMs,
      });
      for (const page of data.query?.pages || []) {
        const rev = page.revisions?.[0];
        if (!rev) continue;
        const ib = parseInfobox(rev.slots.main.content);
        if (!ib || !isActivePro(ib)) {
          skipped++;
          continue;
        }
        const evidenceUrl = pageUrl(api, page.title);
        const steamId = steamAccountId(ib.steam);
        // Vorhandenen Spieler über stabile IDs finden (Liquipedia-Seite oder Steam-Account) – nie über den Namen.
        const existing = findPlayerByIdentity(ctx.db, 'liquipedia', page.title) || (steamId ? findPlayerByIdentity(ctx.db, 'steam-account', steamId) : null);
        const evidence = `Liquipedia: aktuelles Team „${stripWiki(ib.team!)}“ (Seite zuletzt geändert ${rev.timestamp.slice(0, 10)})`;
        let playerId: string;
        if (existing) {
          playerId = existing;
          linkIdentity(ctx.db, playerId, { platform: 'liquipedia', handle: page.title, url: evidenceUrl, evidenceUrl, linkType: 'wiki-listed' });
          upgradeToPro(ctx.db, playerId, ib.id || page.title, evidence);
        } else {
          playerId = upsertPlayer(ctx.db, {
            displayName: ib.id || page.title,
            category: 'pro',
            categoryEvidence: evidence,
            identity: { platform: 'liquipedia', handle: page.title, url: evidenceUrl, evidenceUrl, linkType: 'wiki-listed' },
          }).playerId;
        }
        pros++;
        const add = (platform: string, handle: string | null | undefined, url: string | null) => {
          if (!handle || (platform !== 'steam-account' && !url)) return;
          const r = linkIdentity(ctx.db, playerId, { platform, handle, url, evidenceUrl, linkType: 'wiki-listed' });
          if (r === 'linked') links++;
          if (r === 'conflict') conflicts++;
        };
        if (ib.twitch) add('twitch', ib.twitch, channelUrl('twitch', ib.twitch));
        if (ib.youtube) add('youtube', ib.youtube, channelUrl('youtube', ib.youtube));
        if (ib.twitter) add('twitter', ib.twitter, channelUrl('twitter', ib.twitter));
        if (ib.homepage && /^https?:\/\//.test(ib.homepage)) {
          const gh = /^https?:\/\/(?:www\.)?github\.com\/([\w-]+)\/?$/i.exec(ib.homepage);
          if (gh) add('github', gh[1], `https://github.com/${gh[1]}`);
          else add('homepage', ib.homepage, ib.homepage);
        }
        if (steamId) add('steam-account', steamId, null);
      }
    }
    return { summary: `${pros} aktive Profis, ${links} neue belegte Verlinkungen, ${skipped} Seiten ohne aktives Team, ${conflicts} Identitätskonflikte`, stats: { pros, links, skipped, conflicts } };
  },
};

function upgradeToPro(db: Db, id: string, name: string, evidence: string) {
  const cur = get<{ category: string }>(db, 'SELECT category FROM players WHERE id = ?', id);
  if (cur) run(db, "UPDATE players SET category = 'pro', category_evidence = ?, display_name = CASE WHEN category = 'pro' THEN display_name ELSE ? END WHERE id = ?", evidence, name, id);
}

export function stripWiki(s: string): string {
  return s
    .replace(/\[\[([^|\]]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/\{\{[^}]*\}\}/g, '')
    .trim();
}
