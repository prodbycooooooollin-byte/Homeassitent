import { useEffect } from "react";
import { api } from "./api";
import type { AppSnapshot, CoverColors } from "./types";

/**
 * Passt Akzentfarbe und Hintergrundschein an das Cover des laufenden Titels an.
 * Die Farben berechnet das Backend (nur Spotify-Bildserver); hier werden sie auf gut
 * lesbare Helligkeiten gebracht und als CSS-Variablen gesetzt. Die Überblendung macht CSS
 * (registrierte Farb-Properties mit Transition) – ohne zusätzliche JavaScript-Arbeit.
 */
const cache = new Map<string, CoverColors | null>();

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rf ? (gf - bf) / d + (gf < bf ? 6 : 0) : max === gf ? (bf - rf) / d + 2 : (rf - gf) / d + 4;
  return [h * 60, s, l];
}

/** Lesbare Varianten für dunkles bzw. helles Thema. */
export function songVars(c: CoverColors, light: boolean): Record<string, string> {
  const [h, s0] = rgbToHsl(c.vibrant);
  const s = Math.min(Math.max(s0, 0.25), 0.7) * 100;
  const hh = Math.round(h);
  return light
    ? {
        "--song-accent": `hsl(${hh} ${Math.round(s * 0.8)}% 36%)`,
        "--song-accent-2": `hsl(${hh} ${Math.round(s * 0.8)}% 30%)`,
        "--song-glow": `hsl(${hh} ${Math.round(s)}% 58% / 0.28)`,
        "--song-tint": `hsl(${hh} ${Math.round(s)}% 70% / 0.18)`,
        "--song-deep": `hsl(${hh} ${Math.round(s * 0.7)}% 20%)`,
        "--song-mid": `hsl(${hh} ${Math.round(s * 0.75)}% 34%)`,
        "--song-ink": "#FFFFFF",
      }
    : {
        "--song-accent": `hsl(${hh} ${Math.round(s * 0.85)}% 80%)`,
        "--song-accent-2": `hsl(${hh} ${Math.round(s * 0.85)}% 87%)`,
        "--song-glow": `hsl(${hh} ${Math.round(s)}% 52% / 0.38)`,
        "--song-tint": `hsl(${hh} ${Math.round(s)}% 38% / 0.24)`,
        "--song-deep": `hsl(${hh} ${Math.round(s * 0.6)}% 11%)`,
        "--song-mid": `hsl(${hh} ${Math.round(s * 0.7)}% 27%)`,
        "--song-ink": `hsl(${hh} ${Math.round(s * 0.35)}% 96%)`,
      };
}

const KEYS = ["--song-accent", "--song-accent-2", "--song-glow", "--song-tint", "--song-deep", "--song-mid", "--song-ink"];

function clear() {
  const el = document.documentElement;
  delete el.dataset.song;
  KEYS.forEach((k) => el.style.removeProperty(k));
}

export function useSongColors(snap: AppSnapshot | null) {
  const pb = snap?.spotify.playback;
  const url = pb && pb.state === "active" ? (pb.track?.image_url ?? pb.episode?.image_url ?? null) : null;
  const enabled = snap?.settings.adaptive_colors ?? false;
  const light = document.documentElement.dataset.theme === "light";
  useEffect(() => {
    if (!enabled || !url) {
      clear();
      return;
    }
    let cancelled = false;
    const apply = (c: CoverColors | null) => {
      if (cancelled) return;
      if (!c || c.muted) return clear();
      const el = document.documentElement;
      Object.entries(songVars(c, light)).forEach(([k, v]) => el.style.setProperty(k, v));
      el.dataset.song = "on";
    };
    if (cache.has(url)) apply(cache.get(url)!);
    else
      api.coverColors(url).then(
        (c) => { cache.set(url, c); apply(c); },
        () => { cache.set(url, null); apply(null); },
      );
    return () => { cancelled = true; };
  }, [url, enabled, light]);
}
