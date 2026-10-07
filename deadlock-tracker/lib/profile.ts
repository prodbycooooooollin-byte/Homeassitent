import { gradeFor } from "./rating";
import { badgeToLinear } from "./ranks";
import type { MatchListItem } from "./view";

/* Reine Auswertungen über die getrackten Matches (neueste zuerst). Läuft im Browser. */

export interface Session { matches: MatchListItem[]; wins: number; losses: number; avgScore: number | null; start: number; end: number }

/** Session = Matches mit weniger als `gapMin` Minuten Pause dazwischen; liefert die jüngste Session. */
export function currentSession(items: MatchListItem[], nowS = Date.now() / 1000, gapMin = 75): Session | null {
  if (!items.length) return null;
  const sess: MatchListItem[] = [items[0]];
  for (let i = 1; i < items.length; i++) {
    const prevStart = sess[sess.length - 1].startTime;
    const thisEnd = items[i].startTime + items[i].durationS;
    if (prevStart - thisEnd > gapMin * 60) break;
    sess.push(items[i]);
  }
  const last = sess[0];
  if (nowS - (last.startTime + last.durationS) > 6 * 3600) return null; // keine aktuelle Session
  const scores = sess.map((m) => m.score).filter((x): x is number => x !== null);
  const wins = sess.filter((m) => m.won).length;
  return { matches: sess, wins, losses: sess.length - wins, avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null, start: sess[sess.length - 1].startTime, end: last.startTime + last.durationS };
}

/** Aktuelle Serie: positiv = Siege in Folge, negativ = Niederlagen in Folge. */
export function streak(items: MatchListItem[]): number {
  if (!items.length) return 0;
  const w = items[0].won;
  let n = 0;
  for (const m of items) { if (m.won !== w) break; n++; }
  return w ? n : -n;
}

export function longestWinStreak(items: MatchListItem[]): number {
  let best = 0, cur = 0;
  for (const m of [...items].reverse()) { cur = m.won ? cur + 1 : 0; best = Math.max(best, cur); }
  return best;
}

export interface Records { key: string; label: string; value: string; matchId: number; heroId: number }
export function records(items: MatchListItem[]): Records[] {
  if (!items.length) return [];
  const best = (f: (m: MatchListItem) => number) => items.reduce((b, m) => (f(m) > f(b) ? m : b), items[0]);
  const kda = (m: MatchListItem) => (m.kills + m.assists) / Math.max(1, m.deaths);
  const out: Records[] = [];
  const add = (key: string, label: string, m: MatchListItem, value: string) => out.push({ key, label, value, matchId: m.matchId, heroId: m.heroId });
  const k = best((m) => m.kills); add("kills", "Meiste Kills", k, String(k.kills));
  const a = best((m) => m.assists); add("assists", "Meiste Assists", a, String(a.assists));
  const d = best(kda); add("kda", "Bestes KDA", d, kda(d).toFixed(1));
  const s = best((m) => m.netWorth); add("souls", "Meiste Souls", s, `${(s.netWorth / 1000).toFixed(1)}k`);
  const sc = best((m) => m.score ?? -1); if (sc.score !== null) add("score", "Höchstes Rating", sc, sc.score.toFixed(2));
  const wins = items.filter((m) => m.won);
  if (wins.length) { const q = wins.reduce((b, m) => (m.durationS < b.durationS ? m : b), wins[0]); add("fast", "Schnellster Sieg", q, `${Math.floor(q.durationS / 60)}:${String(q.durationS % 60).padStart(2, "0")}`); }
  const l = best((m) => m.durationS); add("long", "Längstes Match", l, `${Math.floor(l.durationS / 60)} Min.`);
  return out;
}

/** Aktivität je Kalendertag (lokale Zeit) der letzten `weeks` Wochen. */
export function activity(items: MatchListItem[], weeks = 15, now = new Date()): { date: Date; n: number; wins: number }[] {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (end.getDay() + 6) % 7; // Montag = 0
  const start = new Date(end); start.setDate(end.getDate() - dow - (weeks - 1) * 7);
  const map = new Map<string, { n: number; wins: number }>();
  for (const m of items) {
    const d = new Date(m.startTime * 1000);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const e = map.get(key) ?? { n: 0, wins: 0 };
    e.n++; if (m.won) e.wins++;
    map.set(key, e);
  }
  const out: { date: Date; n: number; wins: number }[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const e = map.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    out.push({ date: new Date(d), n: e?.n ?? 0, wins: e?.wins ?? 0 });
  }
  return out;
}

export interface Bucket { label: string; n: number; wins: number }
const bucketize = (items: MatchListItem[], labels: string[], idx: (m: MatchListItem) => number): Bucket[] => {
  const b = labels.map((label) => ({ label, n: 0, wins: 0 }));
  for (const m of items) { const i = idx(m); if (b[i]) { b[i].n++; if (m.won) b[i].wins++; } }
  return b;
};
export const byHour = (items: MatchListItem[]) => bucketize(items, ["0–4", "4–8", "8–12", "12–16", "16–20", "20–24"], (m) => Math.floor(new Date(m.startTime * 1000).getHours() / 4));
export const byWeekday = (items: MatchListItem[]) => bucketize(items, ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"], (m) => (new Date(m.startTime * 1000).getDay() + 6) % 7);
export const byDuration = (items: MatchListItem[]) => bucketize(items, ["< 25 Min", "25–35", "35–45", "> 45 Min"], (m) => (m.durationS < 1500 ? 0 : m.durationS < 2100 ? 1 : m.durationS < 2700 ? 2 : 3));

/** Winrate gegen schwächere/gleich starke/stärkere Lobbys (Ø Lobby-Rang vs. eigener Rang). */
export function byLobbyStrength(items: MatchListItem[]): Bucket[] {
  const b: Bucket[] = [{ label: "Schwächere Lobby", n: 0, wins: 0 }, { label: "Gleich stark", n: 0, wins: 0 }, { label: "Stärkere Lobby", n: 0, wins: 0 }];
  for (const m of items) {
    const me = badgeToLinear(m.myBadge), lob = badgeToLinear(m.lobbyBadge);
    if (me === null || lob === null) continue;
    const i = lob < me - 1 ? 0 : lob > me + 1 ? 2 : 1;
    b[i].n++; if (m.won) b[i].wins++;
  }
  return b;
}

/** Durchschnitt der Rating-Teilwerte (für das Radar). */
export function radar(items: MatchListItem[], last = 20): { labels: string[]; values: number[] } | null {
  const rated = items.filter((m) => m.parts).slice(0, last);
  if (!rated.length) return null;
  const labels = ["KDA", "Kill-Beteiligung", "Souls/Min", "Schaden/Heilung", "Objectives"];
  return { labels, values: labels.map((_, i) => rated.reduce((a, m) => a + (m.parts as number[])[i], 0) / rated.length) };
}

export function avgLobby(items: MatchListItem[], last = 20): number | null {
  const l = items.slice(0, last).map((m) => badgeToLinear(m.lobbyBadge)).filter((x): x is number => x !== null);
  return l.length ? l.reduce((a, b) => a + b, 0) / l.length : null;
}

export interface Insight { icon: string; text: string; tone: "good" | "bad" | "info" }
export function insights(items: MatchListItem[], heroName: (id: number) => string): Insight[] {
  const out: Insight[] = [];
  if (items.length < 3) return out;
  const st = streak(items);
  if (st >= 3) out.push({ icon: "🔥", text: `${st} Siege in Folge – bleib dran!`, tone: "good" });
  if (st <= -3) out.push({ icon: "🧊", text: `${-st} Niederlagen in Folge – vielleicht kurz Pause machen?`, tone: "bad" });
  const heroes = new Map<number, { n: number; w: number }>();
  for (const m of items) { const h = heroes.get(m.heroId) ?? { n: 0, w: 0 }; h.n++; if (m.won) h.w++; heroes.set(m.heroId, h); }
  const ranked = [...heroes.entries()].filter(([, h]) => h.n >= 3).map(([id, h]) => ({ id, ...h, wr: h.w / h.n }));
  if (ranked.length >= 2) {
    const best = ranked.reduce((a, b) => (b.wr > a.wr ? b : a)), worst = ranked.reduce((a, b) => (b.wr < a.wr ? b : a));
    if (best.wr > 0.55) out.push({ icon: "👑", text: `Dein stärkster Held: ${heroName(best.id)} – ${Math.round(best.wr * 100)}% Winrate in ${best.n} Spielen.`, tone: "good" });
    if (worst.wr < 0.45 && worst.id !== best.id) out.push({ icon: "⚠", text: `Mit ${heroName(worst.id)} läuft es schwer: ${Math.round(worst.wr * 100)}% in ${worst.n} Spielen.`, tone: "bad" });
  }
  const hours = byHour(items).filter((b) => b.n >= 4);
  if (hours.length >= 2) {
    const best = hours.reduce((a, b) => (b.wins / b.n > a.wins / a.n ? b : a));
    if (best.wins / best.n >= 0.55) out.push({ icon: "🕒", text: `Zwischen ${best.label} Uhr gewinnst du am häufigsten (${Math.round((best.wins / best.n) * 100)}%).`, tone: "info" });
  }
  const dur = byDuration(items).filter((b) => b.n >= 4);
  if (dur.length >= 2) {
    const best = dur.reduce((a, b) => (b.wins / b.n > a.wins / a.n ? b : a));
    out.push({ icon: "⏱", text: `Matches mit ${best.label} liegen dir am besten (${Math.round((best.wins / best.n) * 100)}% Winrate).`, tone: "info" });
  }
  const scored = items.filter((m) => m.score !== null);
  if (scored.length >= 12) {
    const avg = (xs: MatchListItem[]) => xs.reduce((a, m) => a + (m.score as number), 0) / xs.length;
    const diff = avg(scored.slice(0, 6)) - avg(scored.slice(6, 12));
    if (Math.abs(diff) >= 0.08) out.push({ icon: diff > 0 ? "📈" : "📉", text: `Dein Rating der letzten 6 Matches ist ${diff > 0 ? "um" : "um"} ${Math.abs(diff).toFixed(2)} ${diff > 0 ? "gestiegen" : "gefallen"}.`, tone: diff > 0 ? "good" : "bad" });
  }
  const ls = byLobbyStrength(items);
  if (ls[2].n >= 4 && ls[0].n >= 4) out.push({ icon: "⚔", text: `Gegen stärkere Lobbys gewinnst du ${Math.round((ls[2].wins / ls[2].n) * 100)}%, gegen schwächere ${Math.round((ls[0].wins / ls[0].n) * 100)}%.`, tone: "info" });
  return out.slice(0, 6);
}

export interface Achievement { key: string; icon: string; title: string; desc: string; progress: number; target: number }
export function achievements(items: MatchListItem[]): Achievement[] {
  const n = items.length;
  const heroCount = new Map<number, number>();
  for (const m of items) heroCount.set(m.heroId, (heroCount.get(m.heroId) ?? 0) + 1);
  const sGrades = items.filter((m) => m.grade === "S").length;
  const maxHero = Math.max(0, ...heroCount.values());
  let sRun = 0, sBest = 0;
  for (const m of [...items].reverse()) { sRun = m.grade === "S" ? sRun + 1 : 0; sBest = Math.max(sBest, sRun); }
  const A = (key: string, icon: string, title: string, desc: string, progress: number, target: number): Achievement => ({ key, icon, title, desc, progress: Math.min(progress, target), target });
  return [
    A("m12", "◈", "Auf den Geschmack gekommen", "12 Matches getrackt", n, 12),
    A("m100", "◆", "Veteran", "100 Matches getrackt", n, 100),
    A("streak5", "🔥", "Siegesserie", "5 Siege in Folge", longestWinStreak(items), 5),
    A("s1", "★", "Erster S-Rang", "Eine S-Note erreichen", sGrades, 1),
    A("s3", "✦", "Meisterleistung", "3 S-Noten in Folge", sBest, 3),
    A("ghost", "☠", "Unsterblich", "Ein Match ohne Tod gewinnen", items.filter((m) => m.won && m.deaths === 0).length, 1),
    A("kills15", "⚔", "Gemetzel", "15 Kills in einem Match", Math.max(0, ...items.map((m) => m.kills)), 15),
    A("souls60", "💰", "Souls-Magnat", "60.000 Souls in einem Match", Math.max(0, ...items.map((m) => m.netWorth)), 60000),
    A("marathon", "⏳", "Marathon", "Ein Match über 50 Minuten", Math.max(0, ...items.map((m) => m.durationS)) / 60, 50),
    A("blitz", "⚡", "Blitzkrieg", "Einen Sieg unter 22 Minuten", items.some((m) => m.won && m.durationS < 1320) ? 1 : 0, 1),
    A("heroes10", "🎭", "Wandlungsfähig", "10 verschiedene Helden spielen", heroCount.size, 10),
    A("master20", "♛", "Heldenmeister", "20 Matches mit demselben Helden", maxHero, 20),
  ];
}

export { gradeFor };
