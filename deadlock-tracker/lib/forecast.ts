import { badgeToLinear, linearToBadge } from "./ranks";

/* Rang-Prognose: Monte-Carlo-Simulation der nächsten Matches auf Basis deiner echten Rang-Punkte pro Sieg/Niederlage.
 * Eine Division umfasst 1000 Punkte. Die Position innerhalb der Division ist nicht direkt bekannt und wird aus den
 * Punkten seit dem letzten Divisionswechsel geschätzt (Annahme: Wechsel landet mittig). */

export interface HistPoint { t: number; badge: number; delta: number | null; won: boolean }

export interface Model {
  wins: number[];
  losses: number[];
  avgWin: number;
  avgLoss: number;
  /** Punkte innerhalb der aktuellen Division (0–1000, geschätzt) */
  pos: number;
  /** aktueller Rang als lineare Division (Initiate 1 = 1) */
  lin: number;
  samples: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const DIVISION = 1000;

/** Modell aus der Rangverlauf-Liste (älteste zuerst). null, wenn keine Rang-Punkte vorliegen. */
export function buildModel(hist: HistPoint[]): Model | null {
  const withDelta = hist.filter((h) => h.delta !== null && h.delta !== 0);
  const wins = withDelta.filter((h) => (h.delta as number) > 0).map((h) => h.delta as number);
  const losses = withDelta.filter((h) => (h.delta as number) < 0).map((h) => Math.abs(h.delta as number));
  const last = hist[hist.length - 1];
  const lin = last ? badgeToLinear(last.badge) : null;
  if (!wins.length || !losses.length || lin === null) return null;
  // Position: Punkte seit dem letzten Divisionswechsel, ausgehend von der Mitte
  let pos: number;
  let since = 0;
  for (let i = hist.length - 1; i >= 0; i--) {
    if (i > 0 && hist[i].badge !== hist[i - 1].badge) { since += hist[i].delta ?? 0; break; }
    since += hist[i].delta ?? 0;
    if (i === 0) break;
  }
  pos = Math.min(DIVISION - 1, Math.max(0, 500 + since));
  return { wins, losses, avgWin: mean(wins), avgLoss: mean(losses), pos, lin, samples: withDelta.length };
}

/** Siegquote, ab der der Rang im Mittel stabil bleibt. */
export const breakEven = (m: Model) => m.avgLoss / (m.avgWin + m.avgLoss);
/** Erwartete Rang-Punkte pro Match bei Siegquote p. */
export const drift = (m: Model, p: number) => p * m.avgWin - (1 - p) * m.avgLoss;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface Fan { step: number[]; p10: number[]; p50: number[]; p90: number[] }
export interface Sim {
  fan: Fan;
  /** Anteil der Läufe, die die nächste Division innerhalb von n Matches erreichen */
  pUp: number;
  /** … die eine Division absteigen */
  pDown: number;
  /** Matches bis zur nächsten Division: Median und 10/90 % (null, wenn in < 50 % der Läufe erreicht) */
  toNext: { p10: number | null; p50: number | null; p90: number | null };
  /** Erwarteter Rang (linear, mit Nachkomma) nach n Matches */
  endMedian: number;
}

/** Simuliert n Matches bei Siegquote p (Läufe: `runs`, deterministisch über den Seed). */
export function simulate(m: Model, p: number, n: number, runs = 1500, seed = 7): Sim {
  const R = rng(seed);
  const total0 = m.lin * DIVISION + m.pos; // absolute Punkte
  const paths: number[][] = [];
  const first: (number | null)[] = [];
  let up = 0, down = 0;
  const nextLine = (Math.floor(total0 / DIVISION) + 1) * DIVISION;
  const downLine = Math.floor(total0 / DIVISION) * DIVISION;
  for (let r = 0; r < runs; r++) {
    let t = total0, hitUp: number | null = null, hitDown = false;
    const path = [t];
    for (let i = 1; i <= n; i++) {
      t += R() < p ? m.wins[Math.floor(R() * m.wins.length)] : -m.losses[Math.floor(R() * m.losses.length)];
      path.push(t);
      if (hitUp === null && t >= nextLine) hitUp = i;
      if (t < downLine) hitDown = true;
    }
    paths.push(path);
    first.push(hitUp);
    if (hitUp !== null) up++;
    if (hitDown) down++;
  }
  const q = (xs: number[], f: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(f * (s.length - 1))))]; };
  const fan: Fan = { step: [], p10: [], p50: [], p90: [] };
  for (let i = 0; i <= n; i++) {
    const col = paths.map((pa) => pa[i] / DIVISION);
    fan.step.push(i); fan.p10.push(q(col, 0.1)); fan.p50.push(q(col, 0.5)); fan.p90.push(q(col, 0.9));
  }
  const hits = first.filter((x): x is number => x !== null);
  const share = hits.length / runs;
  const hq = (f: number) => (hits.length ? q(hits, f) : null);
  // Zeit bis zur Division: p50 nur, wenn mehr als die Hälfte aller Läufe sie erreicht
  const toNext = { p10: share >= 0.1 ? hq(0.1 / share) : null, p50: share >= 0.5 ? hq(0.5 / share) : null, p90: share >= 0.9 ? hq(0.9 / share) : null };
  return { fan, pUp: up / runs, pDown: down / runs, toNext, endMedian: fan.p50[n] };
}

/** Rang-Bezeichnung zu einem (gebrochenen) linearen Wert. */
export const badgeAt = (lin: number) => linearToBadge(Math.max(1, Math.floor(lin)));
