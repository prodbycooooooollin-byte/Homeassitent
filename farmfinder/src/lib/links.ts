export interface FileLink {
  url: string;
  /** Direkter Download einer .litematic-Datei erkannt */
  direct: boolean;
  host: string;
  label: string;
}

const HOSTS: Record<string, string> = {
  'drive.google.com': 'Google Drive', 'docs.google.com': 'Google Drive', 'mediafire.com': 'MediaFire',
  'mega.nz': 'MEGA', 'dropbox.com': 'Dropbox', 'github.com': 'GitHub', 'raw.githubusercontent.com': 'GitHub',
  'planetminecraft.com': 'Planet Minecraft', 'curseforge.com': 'CurseForge', 'modrinth.com': 'Modrinth',
  'litematica.org': 'Litematica', 'cdn.discordapp.com': 'Discord', 'gofile.io': 'GoFile', 'patreon.com': 'Patreon',
};

/** Wandelt bekannte Share-Links in Direkt-Download-Links um. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname.endsWith('dropbox.com')) { u.searchParams.set('dl', '1'); return u.toString(); }
    if (u.hostname === 'github.com') {
      const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
      if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
    }
    if (u.hostname === 'drive.google.com') {
      const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? u.searchParams.get('id');
      if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
    }
  } catch { /* unverändert */ }
  return raw;
}

/** Findet .litematic-Links und bekannte Datei-Hoster in einer Videobeschreibung. */
export function findSchematicLinks(text: string): FileLink[] {
  const found = new Map<string, FileLink>();
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    const raw = m[0].replace(/[.,;!?]+$/, '');
    let u: URL;
    try { u = new URL(raw); } catch { continue; }
    const host = u.hostname.replace(/^www\./, '');
    const isLitematic = /\.litematic$/i.test(u.pathname) || /\.litematic\b/i.test(decodeURIComponent(u.search));
    const known = Object.keys(HOSTS).find((h) => host === h || host.endsWith(`.${h}`));
    if (!isLitematic && !known) continue;
    const url = normalizeUrl(raw);
    if (!found.has(url)) {
      found.set(url, { url, direct: isLitematic, host, label: isLitematic ? 'Litematica-Datei' : `${HOSTS[known!]}-Link` });
    }
  }
  // direkte .litematic zuerst
  return [...found.values()].sort((a, b) => Number(b.direct) - Number(a.direct));
}
