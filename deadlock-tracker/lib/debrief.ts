import { explainDeaths } from "./training-reasons";
import type { MatchDetails, MatchPlayer, Rating } from "./types";

/* Match-Debrief: Platzierungen im Team und in der Lobby, stärkste/schwächste Seite und eine kurze Analyse. */

export interface DebriefRow { label: string; value: string; team: number; lobby: number; teamSize: number; lobbySize: number }
export interface Debrief {
  rows: DebriefRow[];
  best: { label: string; score: number; detail: string } | null;
  worst: { label: string; score: number; detail: string } | null;
  good: string[];
  bad: string[];
  verdict: string;
}

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n)));

/** Platz (1 = beste) von `p` in `list`; Gleichstände teilen sich den Platz. */
export function rankIn(list: MatchPlayer[], p: MatchPlayer, f: (x: MatchPlayer) => number, lowerBetter = false): number {
  const v = f(p);
  return 1 + list.filter((x) => (lowerBetter ? f(x) < v : f(x) > v)).length;
}

export function buildDebrief(d: MatchDetails, me: MatchPlayer, rating: Rating | null): Debrief {
  const team = d.players.filter((p) => p.team === me.team);
  const defs: { label: string; f: (p: MatchPlayer) => number; low?: boolean; fmt?: (n: number) => string }[] = [
    { label: "Souls", f: (p) => p.netWorth, fmt: k },
    { label: "Kills", f: (p) => p.kills },
    { label: "Tode", f: (p) => p.deaths, low: true },
    { label: "Assists", f: (p) => p.assists },
    { label: "Heldenschaden", f: (p) => p.heroDamage, fmt: k },
    { label: "Objective-Schaden", f: (p) => p.objectiveDamage, fmt: k },
    { label: "Heilung", f: (p) => p.healing, fmt: k },
  ];
  const rows = defs.map((r) => ({ label: r.label, value: (r.fmt ?? String)(r.f(me)), team: rankIn(team, me, r.f, r.low), lobby: rankIn(d.players, me, r.f, r.low), teamSize: team.length, lobbySize: d.players.length }));

  const comps = (rating?.components ?? []).filter((c) => c.applicable);
  const sorted = [...comps].sort((a, b) => b.score - a.score);
  const pick = (c?: (typeof comps)[number]) => (c ? { label: c.label, score: c.score, detail: c.detail } : null);
  const best = pick(sorted[0]);
  const worst = sorted.length > 1 ? pick(sorted[sorted.length - 1]) : null;

  const good = sorted.filter((c) => c.score >= 1.12).slice(0, 3).map((c) => `${c.label}: ${c.detail}`);
  const bad = [...sorted].reverse().filter((c) => c.score <= 0.88).slice(0, 3).map((c) => `${c.label}: ${c.detail}`);
  const deaths = explainDeaths(d, me);
  if (deaths.length >= 3) {
    const by = new Map<string, number>();
    for (const x of deaths) by.set(x.label, (by.get(x.label) ?? 0) + 1);
    const top = [...by].sort((a, b) => b[1] - a[1])[0];
    if (top[1] >= 2) bad.push(`Tode: ${top[1]} von ${deaths.length} als „${top[0]}“.`);
  }
  if (me.souls && me.souls.lost > 1500) bad.push(`${k(me.souls.lost)} Souls durch Tode verloren.`);
  if (!good.length && rating && rating.score >= 1) good.push(`Insgesamt ${rating.score.toFixed(2)} – du lagst über dem Lobby-Schnitt.`);

  const won = d.winningTeam === me.team;
  const g = rating?.grade;
  const verdict = !rating ? "Für dieses Match liegt noch keine Bewertung vor."
    : g === "S" || g === "A" ? `${won ? "Starker Sieg" : "Trotz Niederlage stark gespielt"} – ${best ? `besonders ${best.label.toLowerCase()}` : "rundum überzeugend"}.`
    : g === "B" ? `Solide ${won ? "gewonnen" : "gespielt"}${worst && worst.score < 0.95 ? ` – ${worst.label.toLowerCase()} lässt noch Luft nach oben` : ""}.`
    : g === "C" ? `Durchschnittlich${worst ? `; am meisten Luft bei ${worst.label.toLowerCase()}` : ""}.`
    : `${won ? "Gewonnen, aber" : "Hier ist"} wenig zusammengekommen${worst ? ` – vor allem bei ${worst.label.toLowerCase()}` : ""}.`;
  return { rows, best, worst, good, bad, verdict };
}
