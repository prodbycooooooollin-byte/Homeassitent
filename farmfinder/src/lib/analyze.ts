import { findItem } from './items';
import type { Farm, Level } from './types';
import { detectVersions } from './versions';

const clamp = (n: number): Level => Math.min(5, Math.max(1, Math.round(n))) as Level;

const EASY = ['easy', 'simple', 'beginner', 'starter', 'cheap', 'small', 'tiny', 'basic', 'quick', 'einfach', 'anfänger', 'klein', 'billig', 'schnell gebaut', 'no redstone', 'ohne redstone', 'early game', 'survival friendly', 'minimal'];
const HARD = ['massive', 'huge', 'complex', 'advanced', 'fully automatic', 'fully automated', 'tileable', 'modular', 'compact redstone', 'technical', 'tech', 'schwer', 'komplex', 'riesig', 'vollautomatisch', 'late game', 'endgame', 'mega', 'multi', 'sorting', 'lag-free', 'optimized', 'optimiert'];
const FAST = ['fastest', 'best', 'optimal', 'optimized', 'efficient', 'high rate', 'insane', 'op ', 'maximum', 'max', 'effizient', 'beste', 'schnellste', 'massive', 'huge', 'tileable', 'mega', 'afk'];
const SLOW = ['small', 'simple', 'tiny', 'starter', 'beginner', 'cheap', 'klein', 'einfach', 'anfänger'];

const has = (text: string, words: string[]) => words.filter((w) => text.includes(w)).length;

/** Erkennt Raten wie "10k/h", "12,000 items per hour", "3000 pro Stunde". */
export function extractRate(text: string): number | undefined {
  const m = text.match(/(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(k)?\s*(?:items?\s*)?(?:\/|per\s+|pro\s+|an\s+)\s*(?:h\b|hr\b|hour|stunde)/i);
  if (!m) return undefined;
  let raw = m[1];
  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) raw = raw.replace(/[.,]/g, '');
  else raw = raw.replace(',', '.');
  const v = parseFloat(raw) * (m[2] ? 1000 : 1);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Schwierigkeit 1 (leicht) – 5 (schwer), geschätzt aus Titel, Beschreibung und Videolänge. */
export function estimateDifficulty(title: string, description: string, durationSec?: number): Level {
  const t = title.toLowerCase();
  const d = description.toLowerCase().slice(0, 600);
  let s = 3;
  s -= has(t, EASY) * 1.2 + has(d, EASY) * 0.3;
  s += has(t, HARD) * 1.2 + has(d, HARD) * 0.3;
  if (durationSec) {
    if (durationSec < 180) s -= 0.6;
    else if (durationSec > 1200) s += 0.8;
    else if (durationSec > 600) s += 0.4;
  }
  return clamp(s);
}

/** Effizienz 1–5: Rate (falls genannt), Titelwörter und Zuschauer-Resonanz. */
export function estimateEfficiency(title: string, description: string, views = 0, likes = 0, rate?: number): Level {
  const t = title.toLowerCase();
  let s = 3;
  if (rate) s = rate >= 20000 ? 5 : rate >= 8000 ? 4.4 : rate >= 3000 ? 3.6 : rate >= 1000 ? 2.8 : 2;
  else {
    s += has(t, FAST) * 0.8 - has(t, SLOW) * 0.8 + has(description.toLowerCase().slice(0, 400), FAST) * 0.15;
    const ratio = views > 0 ? likes / views : 0;
    if (ratio > 0.04) s += 0.5;
    else if (ratio > 0 && ratio < 0.01) s -= 0.3;
    if (views > 500_000) s += 0.4;
  }
  return clamp(s);
}

const TIMESTAMP = /^\s*\(?\d{1,2}:\d{2}(?::\d{2})?\)?\s*[-–:]?/;

export interface ParsedItem {
  name: string;
  count: number;
}

/** Liest Materiallisten aus Beschreibung/Kommentar: "64x Hopper", "Hopper x 12", "12 Beobachter", "Chest: 3". */
export function parseItemList(text: string): ParsedItem[] {
  const out = new Map<string, ParsedItem>();
  for (const rawLine of text.split(/\r?\n/)) {
    if (TIMESTAMP.test(rawLine)) continue;
    const line = rawLine.trim().replace(/^[-•*·►▶→>]\s*/, '');
    let name: string | undefined;
    let count = 1;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(\d+)\s*[x×]?\s+(.{2,40})$/i))) { count = +m[1]; name = m[2]; }
    else if ((m = line.match(/^(.{2,40}?)\s*[x×:]\s*(\d+)\s*$/i))) { name = m[1]; count = +m[2]; }
    else if ((m = line.match(/^(.{2,40}?)\s*\((\d+)\s*[x×]?\)\s*$/))) { name = m[1]; count = +m[2]; }
    if (!name) continue;
    name = name.replace(/[,;.]+$/, '').trim();
    const known = findItem(name);
    if (!known && name.split(' ').length > 3) continue; // Fließtext, keine Zutat
    const key = (known?.en ?? name).toLowerCase();
    const prev = out.get(key);
    if (prev) prev.count += count;
    else out.set(key, { name: known?.en ?? name, count });
  }
  return [...out.values()];
}

export interface RawVideo {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  publishedAt?: string;
  views?: number;
  likes?: number;
  durationSec?: number;
  description: string;
}

export function buildFarm(v: RawVideo): Farm {
  const text = `${v.title}\n${v.description.slice(0, 1500)}`;
  const rate = extractRate(`${v.title} ${v.description.slice(0, 800)}`);
  return {
    id: v.videoId,
    ...v,
    versions: detectVersions(text),
    difficulty: estimateDifficulty(v.title, v.description, v.durationSec),
    efficiency: estimateEfficiency(v.title, v.description, v.views, v.likes, rate),
    ratePerHour: rate,
    items: parseItemList(v.description),
  };
}

export type SortKey = 'balance' | 'efficiency' | 'easy' | 'popular' | 'new';

export const difficultyLabel = (l: Level) => (l <= 2 ? 'Einfach' : l === 3 ? 'Mittel' : 'Schwer');

export function sortFarms(farms: Farm[], key: SortKey): Farm[] {
  const arr = [...farms];
  const pop = (f: Farm) => f.views ?? 0;
  const by: Record<SortKey, (a: Farm, b: Farm) => number> = {
    efficiency: (a, b) => b.efficiency - a.efficiency || pop(b) - pop(a),
    easy: (a, b) => a.difficulty - b.difficulty || b.efficiency - a.efficiency,
    balance: (a, b) => b.efficiency - b.difficulty * 0.6 - (a.efficiency - a.difficulty * 0.6) || pop(b) - pop(a),
    popular: (a, b) => pop(b) - pop(a),
    new: (a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  };
  return arr.sort(by[key]);
}
