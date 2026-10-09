import { byHour, byWeekday, type Bucket } from "./profile";
import type { MatchListItem } from "./view";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface Window { n: number; wr: number | null; score: number | null; kda: number | null }
export interface Compare { now: Window; before: Window }

const win = (xs: MatchListItem[]): Window => ({
  n: xs.length,
  wr: xs.length ? xs.filter((m) => m.won).length / xs.length : null,
  score: mean(xs.map((m) => m.score).filter((s): s is number => s !== null)),
  kda: xs.length ? xs.reduce((a, m) => a + m.kills + m.assists, 0) / Math.max(1, xs.reduce((a, m) => a + m.deaths, 0)) : null,
});

/** Letzte `size` Matches gegen die `size` davor (items: neueste zuerst). */
export function compareWindows(items: MatchListItem[], size = 10): Compare {
  return { now: win(items.slice(0, size)), before: win(items.slice(size, size * 2)) };
}

/** Gleitender Mittelwert (zentriert, Fensterbreite `w`) – null-Werte werden übersprungen. */
export function movingAverage(xs: (number | null)[], w = 5): (number | null)[] {
  return xs.map((_, i) => {
    const part = xs.slice(Math.max(0, i - Math.floor(w / 2)), i + Math.ceil(w / 2)).filter((v): v is number => v !== null);
    return part.length ? mean(part) : null;
  });
}

export interface BestSlot { label: string; wr: number; n: number }
const best = (bs: Bucket[], minN: number): BestSlot | null => {
  const ok = bs.filter((b) => b.n >= minN).map((b) => ({ label: b.label, wr: b.wins / b.n, n: b.n })).sort((a, b) => b.wr - a.wr || b.n - a.n);
  return ok[0] ?? null;
};
const worst = (bs: Bucket[], minN: number): BestSlot | null => {
  const ok = bs.filter((b) => b.n >= minN).map((b) => ({ label: b.label, wr: b.wins / b.n, n: b.n })).sort((a, b) => a.wr - b.wr || b.n - a.n);
  return ok[0] ?? null;
};

export function bestTimes(items: MatchListItem[]) {
  return {
    hour: best(byHour(items), 5), hourWorst: worst(byHour(items), 5),
    day: best(byWeekday(items), 4), dayWorst: worst(byWeekday(items), 4),
  };
}

/** Matches pro Woche über die letzten 4 Wochen. */
export function perWeek(items: MatchListItem[], now = Date.now()): number {
  const since = now / 1000 - 28 * 86400;
  return Math.round((items.filter((m) => m.startTime >= since).length / 4) * 10) / 10;
}
