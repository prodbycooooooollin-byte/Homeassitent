import { badgeToLinear } from "./ranks";
import type { HistoryEntry } from "./types";

/* Scouting: aus der öffentlichen Match-Historie eines Spielers Eigenschaften ableiten
 * („spielt das erste Mal diesen Helden“, „aggressiv“, „Smurf-Verdacht“ …). Reine Funktionen, gut testbar. */

export type TagTone = "good" | "bad" | "info" | "warn";
export interface ScoutTag { key: string; label: string; tone: TagTone; icon: string; tip: string }

export interface PlayerFacts {
  accountId: number; heroId: number; team: 0 | 1;
  name?: string; avatar?: string; badge: number | null;
  /** null = Historie nicht abrufbar (privat/Fehler/Rate-Limit) */
  history: HistoryEntry[] | null;
}
export interface ScoutPlayer {
  accountId: number; heroId: number; team: 0 | 1; name?: string; avatar?: string; badge: number | null; isMe: boolean;
  games: number | null; wr: number | null; heroGames: number | null; heroWr: number | null; kda: number | null;
  /** Kills/Tode/Assists pro Minute (letzte 30 Matches) */
  kpm: number | null; dpm: number | null; apm: number | null;
  /** letzte Ergebnisse, neueste zuerst */
  recent: boolean[];
  /** Meistgespielte Helden (aus der Historie) */
  topHeroes: { heroId: number; games: number; wr: number }[];
  tags: ScoutTag[];
}
export interface Baseline { kpm: number; dpm: number; apm: number }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Pro-Minute-Werte über die letzten `n` Matches. */
export function rates(h: HistoryEntry[], n = 30) {
  const last = [...h].sort((a, b) => b.startTime - a.startTime).slice(0, n).filter((m) => m.durationS > 300);
  const mins = last.reduce((a, m) => a + m.durationS / 60, 0);
  if (!last.length || mins <= 0) return null;
  const k = last.reduce((a, m) => a + m.kills, 0), d = last.reduce((a, m) => a + m.deaths, 0), a = last.reduce((x, m) => x + m.assists, 0);
  return { kpm: k / mins, dpm: d / mins, apm: a / mins, kda: (k + a) / Math.max(1, d) };
}

/** Durchschnitt der Pro-Minute-Werte aller Spieler der Lobby – Maßstab für „aggressiv“ usw. */
export function lobbyBaseline(all: PlayerFacts[]): Baseline {
  const r = all.map((f) => (f.history ? rates(f.history) : null)).filter((x): x is NonNullable<typeof x> => !!x);
  return { kpm: mean(r.map((x) => x.kpm)) || 0.2, dpm: mean(r.map((x) => x.dpm)) || 0.17, apm: mean(r.map((x) => x.apm)) || 0.3 };
}

export function analyzePlayer(f: PlayerFacts, base: Baseline, heroName: string, isMe = false): ScoutPlayer {
  const out: ScoutPlayer = { accountId: f.accountId, heroId: f.heroId, team: f.team, name: f.name, avatar: f.avatar, badge: f.badge, isMe, games: null, wr: null, heroGames: null, heroWr: null, kda: null, kpm: null, dpm: null, apm: null, recent: [], topHeroes: [], tags: [] };
  const tag = (key: string, label: string, tone: TagTone, icon: string, tip: string) => out.tags.push({ key, label, tone, icon, tip });
  if (!f.history) {
    tag("nodata", "Keine Daten", "info", "eye", "Die Match-Historie dieses Spielers ist nicht abrufbar (privates Profil, Fehler oder Rate-Limit).");
    return out;
  }
  const h = [...f.history].sort((a, b) => b.startTime - a.startTime);
  const games = h.length;
  const wins = h.filter((m) => m.won).length;
  const onHero = h.filter((m) => m.heroId === f.heroId);
  const r = rates(h);
  out.games = games; out.wr = games ? wins / games : null;
  out.heroGames = onHero.length; out.heroWr = onHero.length ? onHero.filter((m) => m.won).length / onHero.length : null;
  out.recent = h.slice(0, 8).map((m) => m.won);
  const byHero = new Map<number, { n: number; w: number }>();
  for (const m of h) { const e = byHero.get(m.heroId) ?? { n: 0, w: 0 }; e.n++; if (m.won) e.w++; byHero.set(m.heroId, e); }
  out.topHeroes = [...byHero.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 3).map(([heroId, e]) => ({ heroId, games: e.n, wr: e.w / e.n }));
  if (r) { out.kda = r.kda; out.kpm = r.kpm; out.dpm = r.dpm; out.apm = r.apm; }

  // Erfahrung insgesamt
  if (games === 0) tag("firstever", "Erstes Match überhaupt", "warn", "star", "In der Historie dieses Accounts gibt es noch keine Matches – vermutlich ein neuer Spieler.");
  else if (games < 15) tag("newbie", `Neuling · ${games} Matches`, "warn", "star", `Erst ${games} bekannte Matches – noch wenig Erfahrung.`);
  else if (games >= 300) tag("veteran", `Veteran · ${games} Matches`, "info", "badge", `${games} bekannte Matches – sehr erfahren.`);

  // Erfahrung mit dem aktuellen Helden (nur wenn ein Held bekannt ist, z. B. nicht bei der Einzelspieler-Suche)
  if (f.heroId <= 0) { /* kein Held */ }
  else if (games > 0 && onHero.length === 0) tag("firsthero", `Erstes Mal ${heroName}`, "warn", "sword", `Dieser Spieler hat in seiner Historie noch nie ${heroName} gespielt.`);
  else if (onHero.length > 0 && onHero.length <= 4) tag("fewhero", `${onHero.length}× ${heroName}`, "info", "sword", `Nur ${onHero.length} Matches mit ${heroName} – noch wenig Routine.`);
  else if (onHero.length >= 25 || (games >= 20 && onHero.length / games >= 0.35)) tag("main", `${heroName}-Main · ${onHero.length}×`, "bad", "crown", `${onHero.length} Matches mit ${heroName} (${Math.round(onHero.length / games * 100)}% seiner Spiele) – sehr geübt auf diesem Helden.`);
  if (f.heroId > 0 && onHero.length >= 6 && out.heroWr !== null) {
    if (out.heroWr >= 0.65) tag("herostrong", `Stark mit ${heroName} · ${Math.round(out.heroWr * 100)}%`, "bad", "trendUp", `${Math.round(out.heroWr * 100)}% Winrate in ${onHero.length} Matches mit ${heroName}.`);
    else if (out.heroWr <= 0.35) tag("heroweak", `Schwach mit ${heroName} · ${Math.round(out.heroWr * 100)}%`, "good", "trendDown", `Nur ${Math.round(out.heroWr * 100)}% Winrate in ${onHero.length} Matches mit ${heroName}.`);
  }

  // Spielstil (relativ zur Lobby)
  if (r && games >= 8) {
    if (r.kpm >= base.kpm * 1.25 && r.dpm >= base.dpm * 1.1) tag("aggressive", "Aggressiv", "warn", "flame", `Viele Kills (${r.kpm.toFixed(2)}/Min) und viele Tode (${r.dpm.toFixed(2)}/Min) – sucht Kämpfe. Lobby-Schnitt: ${base.kpm.toFixed(2)} / ${base.dpm.toFixed(2)}.`);
    else if (r.dpm <= base.dpm * 0.75 && r.kpm <= base.kpm * 1.05) tag("careful", "Vorsichtig", "info", "shield", `Stirbt selten (${r.dpm.toFixed(2)} Tode/Min, Lobby-Schnitt ${base.dpm.toFixed(2)}).`);
    if (r.apm >= base.apm * 1.3) tag("assist", "Teamplayer", "info", "users", `Überdurchschnittlich viele Assists (${r.apm.toFixed(2)}/Min).`);
    if (r.kda >= 4) tag("efficient", `KDA ${r.kda.toFixed(1)}`, "bad", "target", `Sehr effizient: (K+A)/D von ${r.kda.toFixed(1)} über die letzten Matches.`);
  }

  // Form & Auffälligkeiten
  const last5 = h.slice(0, 5);
  if (last5.length === 5) {
    if (last5.filter((m) => m.won).length >= 4) tag("hot", "In Form", "bad", "flame", "4 oder mehr Siege in den letzten 5 Matches.");
    if (last5.filter((m) => !m.won).length >= 4) tag("tilt", "Formtief", "good", "trendDown", "4 oder mehr Niederlagen in den letzten 5 Matches.");
  }
  if (games >= 8 && games <= 60 && out.wr !== null && out.wr >= 0.68 && out.recent.filter(Boolean).length >= 6) tag("smurf", "Smurf-Verdacht", "bad", "alert", `${Math.round(out.wr * 100)}% Winrate in nur ${games} Matches – ungewöhnlich stark für einen jungen Account.`);
  return out;
}

export interface TeamSummary { avgBadge: number | null; avgWr: number | null; avgGames: number | null; players: number }

export function summarizeTeam(ps: ScoutPlayer[]): TeamSummary {
  const lin = ps.map((p) => badgeToLinear(p.badge)).filter((x): x is number => x !== null);
  const wr = ps.map((p) => p.wr).filter((x): x is number => x !== null);
  const g = ps.map((p) => p.games).filter((x): x is number => x !== null);
  return { avgBadge: lin.length ? Math.round(mean(lin) * 10) / 10 : null, avgWr: wr.length ? mean(wr) : null, avgGames: g.length ? mean(g) : null, players: ps.length };
}

/**
 * Grobe Gewinnschätzung für Team `mine` aus Rang- und Winrate-Unterschied (und optional Held-Matchup).
 * Reine Heuristik – bewusst auf 25–75 % begrenzt.
 */
export function winChance(mine: TeamSummary, enemy: TeamSummary, matchupEdge = 0): number {
  const rank = mine.avgBadge !== null && enemy.avgBadge !== null ? (mine.avgBadge - enemy.avgBadge) * 0.12 : 0;
  const wr = mine.avgWr !== null && enemy.avgWr !== null ? (mine.avgWr - enemy.avgWr) * 3 : 0;
  const p = 1 / (1 + Math.exp(-(rank + wr + matchupEdge * 4)));
  return Math.min(0.75, Math.max(0.25, p));
}

/** Kurze Klartext-Hinweise für die Zusammenfassung. */
export function scoutInsights(players: ScoutPlayer[], heroName: (id: number) => string, mine: TeamSummary, enemy: TeamSummary): string[] {
  const out: string[] = [];
  const who = (p: ScoutPlayer) => p.name ?? `Spieler ${p.accountId}`;
  for (const p of players) {
    const side = p.isMe ? "Du" : who(p);
    const enemyOf = p.team !== (players.find((x) => x.isMe)?.team ?? 0);
    const t = (k: string) => p.tags.some((x) => x.key === k);
    if (t("firstever")) out.push(`${side} spielt zum ersten Mal überhaupt${enemyOf ? " (Gegner)" : " (Team)"}.`);
    else if (t("newbie") && !p.isMe) out.push(`${who(p)} ist ein Neuling (${p.games} Matches)${enemyOf ? " im gegnerischen Team" : " in deinem Team"}.`);
    if (t("firsthero")) out.push(`${side} spielt zum ersten Mal ${heroName(p.heroId)}${enemyOf ? " – Gegner" : ""}.`);
    if (t("smurf")) out.push(`${p.isMe ? "Du" : who(p)}: Smurf-Verdacht (${Math.round((p.wr ?? 0) * 100)}% in ${p.games} Matches)${enemyOf ? " – Gegner" : ""}.`);
    if (t("main") && enemyOf) out.push(`${who(p)} ist ${heroName(p.heroId)}-Main (${p.heroGames}× gespielt) – Vorsicht.`);
  }
  const aggro = players.filter((p) => p.tags.some((x) => x.key === "aggressive") && p.team !== (players.find((x) => x.isMe)?.team ?? 0));
  if (aggro.length) out.push(`${aggro.length} aggressive${aggro.length > 1 ? " Spieler" : "r Spieler"} im Gegnerteam: ${aggro.map((p) => who(p)).slice(0, 3).join(", ")}.`);
  if (mine.avgBadge !== null && enemy.avgBadge !== null) {
    const d = mine.avgBadge - enemy.avgBadge;
    if (Math.abs(d) >= 3) out.push(d > 0 ? `Dein Team hat im Schnitt ${Math.round(d / 6 * 10) / 10} Rang-Stufen mehr.` : `Das Gegnerteam hat im Schnitt ${Math.round(-d / 6 * 10) / 10} Rang-Stufen mehr.`);
  }
  return out.slice(0, 7);
}
