import { gradeFor } from "./rating";
import { averageBadge, formatBadge } from "./ranks";
import { longestWinStreak, streak } from "./profile";
import { SERIES, evaluate } from "./achievements";
import type { MatchListItem, Overview } from "./view";

export const MAX_TITLE = 24;
export const MAX_STATS = 4;
export const MAX_BADGES = 3;

/* ---------- Kennzahlen ---------- */

export interface StatValue { value: string; sub?: string }
export interface StatDef { key: string; label: string; desc: string; compute: (items: MatchListItem[], ov: Overview) => StatValue }

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const DASH: StatValue = { value: "–" };

export const STAT_DEFS: StatDef[] = [
  { key: "winrate", label: "Winrate", desc: "Siege / alle Matches", compute: (_, ov) => ov.matches ? { value: `${Math.round(ov.winrate * 100)}%`, sub: `${ov.wins} Siege` } : DASH },
  { key: "kda", label: "KDA", desc: "(Kills + Assists) / Tode", compute: (_, ov) => ov.matches ? { value: ov.kda.toFixed(2) } : DASH },
  { key: "score", label: "Ø Note", desc: "Durchschnittliche Match-Note", compute: (_, ov) => ov.avgScore === null ? DASH : { value: gradeFor(ov.avgScore), sub: ov.avgScore.toFixed(2) } },
  { key: "matches", label: "Matches", desc: "Anzahl getrackter Matches", compute: (_, ov) => ({ value: String(ov.matches) }) },
  { key: "streakNow", label: "Serie aktuell", desc: "Siege bzw. Niederlagen in Folge", compute: (items) => { const s = streak(items); return s === 0 ? DASH : { value: String(Math.abs(s)), sub: s > 0 ? "Siege in Folge" : "Niederlagen in Folge" }; } },
  { key: "streakBest", label: "Beste Serie", desc: "Längste Siegesserie", compute: (items) => items.length ? { value: String(longestWinStreak(items)), sub: "Siege in Folge" } : DASH },
  { key: "spm", label: "Souls / Min", desc: "Souls pro Spielminute", compute: (items) => { const min = items.reduce((a, m) => a + m.durationS, 0) / 60; return min > 0 ? { value: Math.round(items.reduce((a, m) => a + m.netWorth, 0) / min).toLocaleString("de-DE") } : DASH; } },
  { key: "lobby", label: "Lobby-Rang Ø", desc: "Durchschnittlicher Lobby-Rang", compute: (items) => { const b = averageBadge(items.map((m) => m.lobbyBadge)); return b ? { value: formatBadge(b) } : DASH; } },
  { key: "peak", label: "Peak-Rang", desc: "Höchster erreichter Rang", compute: (_, ov) => { const p = ov.rankHistory.reduce((m, r) => Math.max(m, r.badge), 0); return p ? { value: formatBadge(p) } : DASH; } },
  { key: "duration", label: "Ø Dauer", desc: "Durchschnittliche Match-Dauer", compute: (items) => { const a = avg(items.map((m) => m.durationS)); return a === null ? DASH : { value: `${Math.round(a / 60)} Min` }; } },
  { key: "deaths", label: "Tode / Match", desc: "Durchschnittliche Tode pro Match", compute: (items) => { const a = avg(items.map((m) => m.deaths)); return a === null ? DASH : { value: a.toFixed(1) }; } },
];
// Heldenschaden pro Minute ist in der Match-Liste nicht enthalten (nur in den Match-Details) und daher nicht wählbar.
export const STAT_KEYS = STAT_DEFS.map((s) => s.key);

export function computeStat(key: string, items: MatchListItem[], ov: Overview): (StatValue & { label: string }) | null {
  const d = STAT_DEFS.find((s) => s.key === key);
  return d ? { label: d.label, ...d.compute(items, ov) } : null;
}

/* ---------- Titel ---------- */

export interface TitleSuggestion { title: string; /** Bedingung, wie sie in der Hover-Erklärung steht */ condition: string; earned: boolean; /** aktueller Wert zur Bedingung */ current: string }

const share = (items: MatchListItem[], f: (m: MatchListItem) => boolean) => (items.length ? items.filter(f).length / items.length : 0);

export function titleSuggestions(items: MatchListItem[], ov: Overview): TitleSuggestion[] {
  const n = items.length;
  const min = items.reduce((a, m) => a + m.durationS, 0) / 60;
  const spm = min > 0 ? items.reduce((a, m) => a + m.netWorth, 0) / min : 0;
  const deaths = avg(items.map((m) => m.deaths)) ?? 0;
  const withRole = items.filter((m) => m.role);
  const lane = avg(items.map((m) => m.parts?.[6]).filter((x): x is number => typeof x === "number"));
  const laneN = items.filter((m) => m.parts).length;
  const best = longestWinStreak(items);
  const tankShare = withRole.length >= 5 ? withRole.filter((m) => m.role === "tank").length / withRole.length : 0;
  const supShare = withRole.length >= 5 ? withRole.filter((m) => m.role === "support").length / withRole.length : 0;
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const t = (title: string, condition: string, earned: boolean, current: string): TitleSuggestion => ({ title, condition, earned, current });
  return [
    t("Frontline-Brecher", "Mindestens 40 % deiner Matches als Frontline (mind. 5 Matches mit erkannter Rolle)", tankShare >= 0.4, pct(tankShare)),
    t("Rückendeckung", "Mindestens 40 % deiner Matches als Support (mind. 5 Matches mit erkannter Rolle)", supShare >= 0.4, pct(supShare)),
    t("Soul-Farmer", "Mindestens 10 Matches und im Schnitt 1.300 Souls pro Minute", n >= 10 && spm >= 1300, `${Math.round(spm)} Souls/Min`),
    t("Tod-Magnet", "Mindestens 10 Matches und im Schnitt 8 oder mehr Tode pro Match", n >= 10 && deaths >= 8, `${deaths.toFixed(1)} Tode`),
    t("Eisenwand", "Mindestens 10 Matches und im Schnitt höchstens 4 Tode pro Match", n >= 10 && deaths <= 4, `${deaths.toFixed(1)} Tode`),
    t("Serien-Sieger", "Längste Siegesserie von mindestens 5 Matches", best >= 5, `${best} Siege`),
    t("Lane-Dominator", "Mindestens 5 bewertete Matches und Lane-Baustein im Schnitt 1,10 oder besser", laneN >= 5 && (lane ?? 0) >= 1.1, lane === null ? "–" : lane.toFixed(2)),
    t("Siegertyp", "Mindestens 20 Matches und Winrate ab 55 %", n >= 20 && ov.winrate >= 0.55, pct(ov.winrate)),
    t("Unermüdlich", "Mindestens 100 getrackte Matches", n >= 100, `${n} Matches`),
    t("Held des Volkes", "Mindestens 60 % deiner Matches mit nur einem Helden (mind. 20 Matches)", n >= 20 && share(items, (m) => m.heroId === ov.heroes[0]?.heroId) >= 0.6, pct(share(items, (m) => m.heroId === ov.heroes[0]?.heroId))),
  ];
}

/* ---------- Abzeichen ---------- */

export const BADGE_KEYS = SERIES.map((s) => s.key);

/** Freigeschaltete Erfolge, höchste Stufe zuerst (bei Gleichstand nach Fortschritt zur nächsten Stufe). */
export function unlockedBadges(items: MatchListItem[], ov: Overview) {
  return evaluate(items, ov).filter((s) => s.tier > 0).sort((a, b) => b.tier - a.tier || b.progress - a.progress || a.series.title.localeCompare(b.series.title));
}

/* ---------- Farben ---------- */

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (s: unknown): s is string => typeof s === "string" && HEX.test(s);

export const ACCENT_SWATCHES = ["#8b6cff", "#3fd0f0", "#4aa3ff", "#3ecf8e", "#a6e22e", "#f0b44c", "#ff8559", "#f0616d", "#ef5da8", "#e8ecf4"] as const;
export const FALLBACK_ACCENTS = ["#8b6cff", "#3fd0f0"] as const;

function rgb(hex: string): [number, number, number] { return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]; }
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
export function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}

/** Hebt dunkle oder entsättigte Akzentfarben an (Luminanz < 0,35 oder Sättigung gering); fast graue Farben werden durch Violett ersetzt. */
export function ensureVivid(hex: string, fallback: string = FALLBACK_ACCENTS[0]): string {
  if (!isHex(hex)) return fallback;
  const [h, s0, l0] = toHsl(hex);
  if (s0 < 0.12) return fallback;
  if (luminance(hex) >= 0.35 && s0 >= 0.45) return hex.toLowerCase();
  const s = Math.max(s0, 0.6);
  let l = Math.max(l0, 0.52);
  let out = fromHsl(h, s, l);
  while (luminance(out) < 0.35 && l < 0.78) { l += 0.03; out = fromHsl(h, s, l); }
  return out;
}

/** Wählt die Akzentfarbe aus der Einstellung. `auto` = Helden-Farbe (aufgehellt). */
export function resolveAccent(accent: string, ctx: { heroColor?: string; rankColor?: string }): string {
  if (isHex(accent)) return accent.toLowerCase();
  const base = accent === "rank" ? ctx.rankColor ?? ctx.heroColor : ctx.heroColor ?? ctx.rankColor;
  return ensureVivid(base ?? FALLBACK_ACCENTS[0]);
}
