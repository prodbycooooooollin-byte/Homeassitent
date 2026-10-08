import { badgeToLinear, tierOf } from "./ranks";
import type { IconName } from "../components/Icon";
import type { MatchListItem, Overview } from "./view";

export type AchCategory = "Matches" | "Serien" | "Kampf" | "Leistung" | "Helden" | "Rollen" | "Rang" | "Zeit";
export const CATEGORIES: AchCategory[] = ["Matches", "Serien", "Kampf", "Leistung", "Helden", "Rollen", "Rang", "Zeit"];

export const TIERS = [
  { name: "Bronze", color: "#cd7f32", points: 10 },
  { name: "Silber", color: "#c4ccda", points: 20 },
  { name: "Gold", color: "#f0b44c", points: 40 },
  { name: "Platin", color: "#7fd8ea", points: 70 },
  { name: "Diamant", color: "#b48cff", points: 120 },
] as const;

export interface AchSeries {
  key: string; icon: IconName; title: string; category: AchCategory;
  /** Beschreibung für eine Stufe mit Zielwert */
  desc: (target: number) => string;
  targets: number[];
  value: (c: Ctx) => number;
}
export interface Ctx { items: MatchListItem[]; ov: Overview }

const days = (items: MatchListItem[]) => [...new Set(items.map((m) => { const d = new Date(m.startTime * 1000); return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000); }))].sort((a, b) => a - b);
const longestRun = (xs: number[]) => { let best = 0, cur = 0, prev = -Infinity; for (const x of xs) { cur = x === prev + 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = x; } return best; };
const run = (items: MatchListItem[], ok: (m: MatchListItem) => boolean) => { let best = 0, cur = 0; for (const m of [...items].reverse()) { cur = ok(m) ? cur + 1 : 0; best = Math.max(best, cur); } return best; };
const hour = (m: MatchListItem) => new Date(m.startTime * 1000).getHours();
const dow = (m: MatchListItem) => new Date(m.startTime * 1000).getDay();
const max = (items: MatchListItem[], f: (m: MatchListItem) => number) => Math.max(0, ...items.map(f));
const count = (items: MatchListItem[], f: (m: MatchListItem) => boolean) => items.filter(f).length;
const kda = (m: MatchListItem) => (m.kills + m.assists) / Math.max(1, m.deaths);

export const SERIES: AchSeries[] = [
  { key: "matches", icon: "flag", title: "Stammgast", category: "Matches", desc: (t) => `${t} Matches tracken`, targets: [10, 50, 100, 250, 500], value: (c) => c.items.length },
  { key: "wins", icon: "trophy", title: "Sieger", category: "Matches", desc: (t) => `${t} Matches gewinnen`, targets: [5, 25, 100, 250], value: (c) => count(c.items, (m) => m.won) },
  { key: "winstreak", icon: "flame", title: "Siegesserie", category: "Serien", desc: (t) => `${t} Siege in Folge`, targets: [3, 5, 8, 12], value: (c) => run(c.items, (m) => m.won) },
  { key: "daystreak", icon: "calendar", title: "Dranbleiber", category: "Serien", desc: (t) => `An ${t} Tagen in Folge spielen`, targets: [3, 7, 14, 30], value: (c) => longestRun(days(c.items)) },
  { key: "steady", icon: "target", title: "Konstanz", category: "Serien", desc: (t) => `${t} Matches in Folge mit mindestens Note B`, targets: [3, 6, 10, 15], value: (c) => run(c.items, (m) => ["S", "A", "B"].includes(m.grade ?? "")) },
  { key: "kills", icon: "sword", title: "Gemetzel", category: "Kampf", desc: (t) => `${t} Kills in einem Match`, targets: [10, 15, 20, 25], value: (c) => max(c.items, (m) => m.kills) },
  { key: "assists", icon: "users", title: "Teamplayer", category: "Kampf", desc: (t) => `${t} Assists in einem Match`, targets: [15, 25, 35], value: (c) => max(c.items, (m) => m.assists) },
  { key: "kda", icon: "bolt", title: "Unantastbar", category: "Kampf", desc: (t) => `KDA von ${t} in einem Match`, targets: [5, 10, 20], value: (c) => Math.round(max(c.items, kda)) },
  { key: "deathless", icon: "ghost", title: "Unsterblich", category: "Kampf", desc: (t) => `${t} Sieg${t > 1 ? "e" : ""} ohne einen Tod`, targets: [1, 3, 10], value: (c) => count(c.items, (m) => m.won && m.deaths === 0) },
  { key: "totalkills", icon: "skull", title: "Jäger", category: "Kampf", desc: (t) => `${t} Kills insgesamt`, targets: [100, 500, 2000], value: (c) => c.items.reduce((a, m) => a + m.kills, 0) },
  { key: "s", icon: "star", title: "Bestnote", category: "Leistung", desc: (t) => `${t} × Note S`, targets: [1, 5, 15, 40], value: (c) => count(c.items, (m) => m.grade === "S") },
  { key: "souls", icon: "gem", title: "Souls-Magnat", category: "Leistung", desc: (t) => `${Math.round(t / 1000)}k Souls in einem Match`, targets: [40000, 60000, 80000, 100000], value: (c) => max(c.items, (m) => m.netWorth) },
  { key: "score", icon: "medal", title: "Rating-Jäger", category: "Leistung", desc: (t) => `Rating von ${(t / 100).toFixed(1)} in einem Match`, targets: [130, 150, 170], value: (c) => Math.round(max(c.items, (m) => (m.score ?? 0) * 100)) },
  { key: "heroes", icon: "layers", title: "Wandlungsfähig", category: "Helden", desc: (t) => `${t} verschiedene Helden spielen`, targets: [5, 10, 20, 30], value: (c) => new Set(c.items.map((m) => m.heroId)).size },
  { key: "main", icon: "crown", title: "Heldenmeister", category: "Helden", desc: (t) => `${t} Matches mit demselben Helden`, targets: [20, 50, 100], value: (c) => { const n = new Map<number, number>(); c.items.forEach((m) => n.set(m.heroId, (n.get(m.heroId) ?? 0) + 1)); return Math.max(0, ...n.values()); } },
  { key: "herowins", icon: "badge", title: "Alleskönner", category: "Helden", desc: (t) => `Mit ${t} verschiedenen Helden gewinnen`, targets: [5, 10, 20], value: (c) => new Set(c.items.filter((m) => m.won).map((m) => m.heroId)).size },
  { key: "roles", icon: "shuffle", title: "Rollenspieler", category: "Rollen", desc: (t) => `${t} verschiedene Rollen spielen`, targets: [2, 3, 4], value: (c) => new Set(c.items.map((m) => m.role).filter(Boolean)).size },
  { key: "supportwins", icon: "plus", title: "Rückendeckung", category: "Rollen", desc: (t) => `${t} Siege als Support`, targets: [3, 10, 25], value: (c) => count(c.items, (m) => m.won && m.role === "support") },
  { key: "carrywins", icon: "fist", title: "Hard Carry", category: "Rollen", desc: (t) => `${t} Siege als Carry`, targets: [5, 20, 50], value: (c) => count(c.items, (m) => m.won && m.role === "carry") },
  { key: "tankwins", icon: "shield", title: "Bollwerk", category: "Rollen", desc: (t) => `${t} Siege als Frontline`, targets: [3, 10, 25], value: (c) => count(c.items, (m) => m.won && m.role === "tank") },
  { key: "peak", icon: "rocket", title: "Aufstieg", category: "Rang", desc: (t) => `Rang-Stufe ${t} erreichen`, targets: [3, 5, 7, 9, 11], value: (c) => Math.max(0, ...c.ov.rankHistory.map((r) => tierOf(r.badge)), tierOf(c.ov.currentBadge)) },
  { key: "promos", icon: "trendUp", title: "Aufsteiger", category: "Rang", desc: (t) => `${t} Rang-Aufstiege erleben`, targets: [3, 10, 25], value: (c) => c.ov.rankHistory.filter((r, i, a) => i > 0 && (badgeToLinear(r.badge) ?? 0) > (badgeToLinear(a[i - 1].badge) ?? 0)).length },
  { key: "giant", icon: "eye", title: "Riesentöter", category: "Rang", desc: (t) => `${t} Siege gegen stärkere Lobbys`, targets: [3, 10, 25], value: (c) => count(c.items, (m) => m.won && (badgeToLinear(m.lobbyBadge) ?? 0) > (badgeToLinear(m.myBadge) ?? 99) + 1) },
  { key: "marathon", icon: "hourglass", title: "Marathon", category: "Zeit", desc: (t) => `Ein Match über ${t} Minuten`, targets: [40, 50, 60], value: (c) => Math.floor(max(c.items, (m) => m.durationS) / 60) },
  { key: "blitz", icon: "zap", title: "Blitzkrieg", category: "Zeit", desc: (t) => `${t} Sieg${t > 1 ? "e" : ""} unter 25 Minuten`, targets: [1, 5, 15], value: (c) => count(c.items, (m) => m.won && m.durationS < 1500) },
  { key: "night", icon: "moon", title: "Nachteule", category: "Zeit", desc: (t) => `${t} Matches zwischen 0 und 5 Uhr starten`, targets: [5, 20, 50], value: (c) => count(c.items, (m) => hour(m) < 5) },
  { key: "early", icon: "sun", title: "Frühaufsteher", category: "Zeit", desc: (t) => `${t} Matches zwischen 5 und 9 Uhr starten`, targets: [5, 20, 50], value: (c) => count(c.items, (m) => hour(m) >= 5 && hour(m) < 9) },
  { key: "weekend", icon: "calendar", title: "Wochenend-Krieger", category: "Zeit", desc: (t) => `${t} Matches am Wochenende`, targets: [10, 40, 100], value: (c) => count(c.items, (m) => dow(m) === 0 || dow(m) === 6) },
];

export interface AchState {
  series: AchSeries;
  value: number;
  /** Anzahl freigeschalteter Stufen */
  tier: number;
  /** Ziel der nächsten Stufe (null = alles geschafft) */
  next: number | null;
  /** Fortschritt zur nächsten Stufe 0..1 */
  progress: number;
}

export function evaluate(items: MatchListItem[], ov: Overview): AchState[] {
  const ctx = { items, ov };
  return SERIES.map((series) => {
    const value = series.value(ctx);
    const tier = series.targets.filter((t) => value >= t).length;
    const next = series.targets[tier] ?? null;
    const prev = series.targets[tier - 1] ?? 0;
    return { series, value, tier, next, progress: next === null ? 1 : Math.max(0, Math.min(1, (value - prev) / (next - prev))) };
  });
}

export interface Summary { points: number; level: number; levelProgress: number; unlocked: number; total: number; nextUp: AchState[] }
export const LEVEL_POINTS = 150;

export function summarize(states: AchState[]): Summary {
  const points = states.reduce((a, s) => a + TIERS.slice(0, s.tier).reduce((x, t) => x + t.points, 0), 0);
  return {
    points, level: Math.floor(points / LEVEL_POINTS) + 1, levelProgress: (points % LEVEL_POINTS) / LEVEL_POINTS,
    unlocked: states.reduce((a, s) => a + s.tier, 0), total: states.reduce((a, s) => a + s.series.targets.length, 0),
    nextUp: states.filter((s) => s.next !== null && s.progress > 0).sort((a, b) => b.progress - a.progress).slice(0, 3),
  };
}
