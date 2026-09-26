/**
 * DEMO-Adapter: erzeugt ausdrücklich gekennzeichnete Testdaten. Diese Daten sind
 * KEIN Account-Import und werden in der Oberfläche immer als „Demo“ angezeigt.
 * Demo-Clips werden lokal gerendert (eigene Testmedien, kein TikTok-Verkehr).
 */
export const DEMO_ACCOUNT_LABEL = 'Demo-Daten (kein TikTok-Import)';

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function demoLikes(seed: string, count = 40, now = Date.now()): { videoId: string; likedAt: number }[] {
  const out: { videoId: string; likedAt: number }[] = [];
  let h = hash32(seed);
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    const id = `demo-${(h.toString(36) + i.toString(36)).slice(0, 10).padEnd(6, 'x')}`;
    out.push({ videoId: id, likedAt: now - i * 3 * 86_400_000 - (h % 86_400_000) });
  }
  return out;
}

const THEMES = [
  { title: 'Katze vs. Gurke', emoji: '🐈', hue: 280 },
  { title: 'Unmögliches Parken', emoji: '🚗', hue: 190 },
  { title: 'Kochen mit 3 Zutaten', emoji: '🍝', hue: 25 },
  { title: 'Tanz-Challenge', emoji: '💃', hue: 320 },
  { title: 'Life-Hack: Kabelsalat', emoji: '🔌', hue: 160 },
  { title: 'Hund lernt Skaten', emoji: '🐕', hue: 45 },
  { title: 'Gaming-Clutch 1v5', emoji: '🎮', hue: 250 },
  { title: 'Sonnenuntergang am Meer', emoji: '🌅', hue: 15 },
  { title: 'Pranks im Büro', emoji: '🖇️', hue: 210 },
  { title: 'DIY Neon-Schild', emoji: '💡', hue: 300 },
  { title: 'Oma reagiert auf Memes', emoji: '👵', hue: 100 },
  { title: 'Makro-Fotografie Tau', emoji: '🌿', hue: 130 }
] as const;

export interface DemoClipLook {
  title: string;
  emoji: string;
  hue: number;
  durationSec: number;
  /** Tonhöhe der Testmelodie. */
  baseFreq: number;
}

/** Deterministisches Aussehen eines Demo-Clips – verrät nichts über den Besitzer. */
export function demoClipLook(videoId: string): DemoClipLook {
  const h = hash32(videoId);
  const theme = THEMES[h % THEMES.length]!;
  return {
    title: theme.title,
    emoji: theme.emoji,
    hue: (theme.hue + (h >>> 8) % 30) % 360,
    durationSec: 9 + ((h >>> 4) % 14),
    baseFreq: 196 + ((h >>> 12) % 8) * 22
  };
}
