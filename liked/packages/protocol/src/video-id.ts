/**
 * Normalisierung von TikTok-Links auf stabile numerische Video-IDs.
 *
 * Unterstützte Formen (u. a. aus dem Data-Portability-Archiv):
 *   https://www.tiktok.com/@name/video/7234567890123456789
 *   https://www.tiktokv.com/share/video/7234567890123456789/
 *   https://m.tiktok.com/v/7234567890123456789.html
 *   https://www.tiktok.com/player/v1/7234567890123456789
 *   https://www.tiktok.com/embed/v2/7234567890123456789
 *
 * Kurzlinks (vm.tiktok.com/...) enthalten keine ID und werden bewusst NICHT
 * aufgelöst: Der Server lädt keine vom Client angegebenen URLs.
 */
const ALLOWED_HOSTS = /^(?:www\.|m\.|vt\.|)(?:tiktok\.com|tiktokv\.com)$/i;
const ID_PATTERNS = [
  /\/video\/(\d{6,25})(?:[/?#]|$)/,
  /\/share\/video\/(\d{6,25})(?:[/?#]|$)/,
  /\/v\/(\d{6,25})(?:\.html)?(?:[/?#]|$)/,
  /\/player\/v1\/(\d{6,25})(?:[/?#]|$)/,
  /\/embed\/(?:v2\/)?(\d{6,25})(?:[/?#]|$)/
];

export function normalizeTikTokVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{6,25}$/.test(trimmed)) return trimmed;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!ALLOWED_HOSTS.test(url.hostname)) return null;
  for (const re of ID_PATTERNS) {
    const m = re.exec(url.pathname);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Offizieller TikTok Embed Player v1. */
export const TIKTOK_PLAYER_ORIGIN = 'https://www.tiktok.com';

export interface EmbedOptions {
  autoplay?: boolean;
  muted?: boolean;
}

/**
 * Baut die Embed-URL ausschließlich aus einer validierten numerischen ID.
 * Parameter laut Embed-Player-Doku: Bedienelemente an, keine Beschreibung/
 * Musikinfo (verrät nichts über den likenden Spieler), keine Empfehlungen.
 */
export function buildTikTokEmbedUrl(videoId: string, opts: EmbedOptions = {}): string {
  if (!/^\d{6,25}$/.test(videoId)) throw new Error('Ungültige Video-ID');
  const params = new URLSearchParams({
    controls: '1',
    progress_bar: '1',
    play_button: '1',
    volume_control: '1',
    fullscreen_button: '0',
    timestamp: '1',
    loop: '0',
    autoplay: opts.autoplay ? '1' : '0',
    muted: opts.muted ? '1' : '0',
    music_info: '0',
    description: '0',
    rel: '0',
    native_context_menu: '0',
    closed_caption: '1'
  });
  return `${TIKTOK_PLAYER_ORIGIN}/player/v1/${videoId}?${params.toString()}`;
}
