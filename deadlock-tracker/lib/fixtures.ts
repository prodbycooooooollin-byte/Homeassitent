import { linearToBadge } from "./ranks";
import type { HistoryEntry, MatchDetails, MatchPlayer, TeamId } from "./types";
import type { ActiveMatchDto, HeroMeta, LeaderboardRow, SteamProfile } from "./api/deadlock-api";

export interface HeroInfo { id: number; name: string }

/** Deterministische Demo-Daten (DEADLOCK_DEMO=1), damit die App ohne Netzwerk bedienbar ist. */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const DEMO_HEROES: HeroInfo[] = [
  "Abrams", "Bebop", "Dynamo", "Grey Talon", "Haze", "Infernus", "Ivy", "Kelvin", "Lady Geist",
  "Lash", "McGinnis", "Mo & Krill", "Paradox", "Pocket", "Seven", "Shiv", "Vindicta", "Viscous",
  "Warden", "Wraith", "Yamato",
].map((name, i) => ({ id: i + 1, name }));

const NAMES = ["Nova", "Kestrel", "Vex", "Orion", "Lumen", "Rook", "Sable", "Tundra", "Ember", "Quill", "Zephyr", "Moth"];

export function demoProfiles(ids: number[]): SteamProfile[] {
  return ids.map((accountId) => ({ accountId, name: `Spieler ${accountId % 10000}`, lastTeamAvgBadge: 63 }));
}

export function demoSearch(q: string): SteamProfile[] {
  return NAMES.filter((n) => n.toLowerCase().includes(q.toLowerCase())).map((n, i) => ({ accountId: 500000 + i, name: n, matches30d: 40 + i * 7, lastTeamAvgBadge: 50 + i }));
}

export const demoRank = 75;

export function demoActive(accountId: number, now = Date.now()): ActiveMatchDto | null {
  // Alle 20 Minuten läuft für 6 Minuten ein Demo-Match (zeigt die Live-Anzeige).
  const phase = Math.floor(now / 60000) % 20;
  if (phase >= 6) return null;
  const r = rng(Math.floor(now / 1200000));
  return {
    matchId: 79999999, startTime: Math.floor(now / 1000) - (phase * 60 + 840), durationS: phase * 60 + 840, mode: "Ranked",
    players: Array.from({ length: 12 }, (_, i) => ({ accountId: i === 0 ? accountId : 0, heroId: 1 + Math.floor(r() * DEMO_HEROES.length), team: (i < 6 ? 0 : 1) as 0 | 1 })),
  };
}

export function demoHeroMeta(): HeroMeta[] {
  return DEMO_HEROES.map((h) => { const r = rng(h.id * 31); const matches = Math.round(2000 + r() * 18000); return { heroId: h.id, matches, wins: Math.round(matches * (0.44 + r() * 0.12)) }; });
}

export function demoLeaderboard(): LeaderboardRow[] {
  const r = rng(7);
  return Array.from({ length: 100 }, (_, i) => ({ rank: i + 1, name: `${NAMES[i % NAMES.length]}${(i * 37) % 99}`, badge: 110 + (i < 10 ? 6 : i < 40 ? 5 : 4) - 4 + 0, heroIds: [1 + Math.floor(r() * 20), 1 + Math.floor(r() * 20), 1 + Math.floor(r() * 20)] }));
}

const DEMO_COUNT = 30;
const matchIdFor = (i: number) => 70000000 + i;

export function demoHistory(accountId: number, now = Date.now()): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  // Das jüngste Demo-Match endete vor ~2 Min, der Rest in ~50-Min-Abständen.
  for (let i = DEMO_COUNT - 1; i >= 0; i--) {
    const d = demoMatch(matchIdFor(i), accountId, now);
    const me = d.players[0];
    out.push({
      matchId: d.matchId, accountId, heroId: me.heroId, startTime: d.startTime, durationS: d.durationS,
      won: d.winningTeam === me.team, team: me.team, kills: me.kills, deaths: me.deaths, assists: me.assists,
      netWorth: me.netWorth, lastHits: me.lastHits, denies: me.denies, heroLevel: me.level, abandoned: false,
      matchMode: "Ranked", gameMode: "1", badge: linearToBadge(6 * 6 + 2 + Math.floor((DEMO_COUNT - i) / 4)),
    });
  }
  return out;
}

export const DEMO_ITEMS = ["Schnellfeuer", "Pufferladung", "Lebensfunke", "Dolch des Schattens", "Glaskanone", "Seelenanker", "Pulsschild", "Zeitriss", "Aderlass", "Eisenhaut", "Nebelschritt", "Sturmherz",
  "Kristallkern", "Rachenspiegel", "Blutmond", "Wächterglas", "Phantomklinge", "Funkenschlag", "Obsidianpanzer", "Gnadenstoß", "Wanderstab", "Sirenengesang", "Titanfaust", "Echoschuss"];

export function demoMatch(matchId: number, focusAccount: number, now = Date.now()): MatchDetails {
  const idx = matchId - 70000000;
  const r = rng(matchId * 7919);
  const durationS = 1500 + Math.floor(r() * 1500);
  const endMs = now - 2 * 60_000 - idx * 50 * 60_000;
  const startTime = Math.floor(endMs / 1000) - durationS;
  const winningTeam: TeamId = r() < 0.5 ? 0 : 1;
  const players: MatchPlayer[] = [];
  for (let s = 0; s < 12; s++) {
    const team: TeamId = s < 6 ? 0 : 1;
    const skill = 0.6 + r() * 0.9 + (team === winningTeam ? 0.15 : 0);
    const mins = durationS / 60;
    const kills = Math.round(skill * (3 + r() * 8));
    const deaths = Math.max(0, Math.round((2 - skill) * (3 + r() * 7)));
    const assists = Math.round(skill * (4 + r() * 12));
    const netWorth = Math.round(skill * mins * (800 + r() * 500));
    const heroDamage = Math.round(skill * mins * (700 + r() * 800));
    const healing = r() < 0.2 ? Math.round(mins * (800 + r() * 600)) : 0;
    const damageTaken = Math.round(mins * (600 + r() * 600));
    // Zeitreihe im Minutentakt (kumulierte Werte, leicht überproportionales Wachstum wie im echten Spiel)
    const pts = Math.floor(durationS / 60);
    const ts = Array.from({ length: pts + 1 }, (_, i) => i * 60);
    const f = (i: number, e = 1.2) => Math.pow(i / pts, e);
    const deathTimes = Array.from({ length: deaths }, () => Math.round(120 + r() * (durationS - 150))).sort((a, b) => a - b);
    const enemySlots = Array.from({ length: 6 }, (_, i) => (team === 0 ? 6 : 0) + i + 1);
    const slot = s + 1;
    players.push({
      accountId: s === 0 ? focusAccount : 100000 + (matchId % 1000) * 20 + s,
      name: s === 0 ? undefined : NAMES[(s + idx) % NAMES.length],
      team, heroId: 1 + Math.floor(r() * DEMO_HEROES.length), kills, deaths, assists, level: 18 + Math.floor(r() * 10),
      netWorth, lastHits: Math.round(skill * mins * (4 + r() * 3)), denies: Math.floor(r() * 15), heroDamage,
      objectiveDamage: Math.round(skill * mins * (60 + r() * 200)), healing, damageTaken,
      allyHealing: healing ? Math.round(healing * 0.9) : Math.round(mins * r() * 60), mitigated: Math.round(damageTaken * (0.2 + r() * 0.5)),
      badge: 50 + Math.floor(r() * 3) * 10 + 1 + Math.floor(r() * 6), abandoned: false,
      slot, lane: [1, 4, 6][Math.floor((s % 6) / 2)], mvpRank: undefined,
      deadTimeS: deathTimes.reduce((a, t) => a + 10 + Math.round(t / 60) * 2, 0),
      timeline: {
        t: ts,
        nw: ts.map((_, i) => Math.round(netWorth * f(i, 1.25))), k: ts.map((_, i) => Math.round(kills * f(i, 1))), d: ts.map((_, i) => Math.round(deaths * f(i, 1))),
        a: ts.map((_, i) => Math.round(assists * f(i, 1))), dmg: ts.map((_, i) => Math.round(heroDamage * f(i, 1.3))),
        heal: ts.map((_, i) => Math.round(healing * f(i, 1.1))), taken: ts.map((_, i) => Math.round(damageTaken * f(i, 1.1))),
      },
      deathLog: deathTimes.map((t) => ({ t, killerSlot: enemySlots[Math.floor(r() * 6)], durS: 10 + Math.round(t / 60) * 2 })),
      items: Array.from({ length: 8 + Math.floor(r() * 5) }, (_, i) => ({ id: 1000 + Math.floor(r() * DEMO_ITEMS.length), t: 60 + i * Math.round(durationS / 14) + Math.floor(r() * 60), sold: r() < 0.1 ? durationS - 200 : undefined })),
    });
  }
  const avg = (t: TeamId) => Math.round(players.filter((p) => p.team === t).reduce((a, p) => a + (p.badge ?? 0), 0) / 6);
  const loser: TeamId = winningTeam === 0 ? 1 : 0;
  const objectives = [1, 2, 3, 5, 6, 7, 9, 0].map((id, i) => ({ id, team: loser, t: Math.round(durationS * (0.25 + i * 0.1)) }))
    .concat([1, 5].map((id, i) => ({ id, team: winningTeam, t: Math.round(durationS * (0.45 + i * 0.2)) })));
  return {
    v: 2, matchId, startTime, durationS, winningTeam, matchMode: "Ranked", gameMode: "1",
    avgBadge: [avg(0), avg(1)], players, objectives, midBoss: [{ team: winningTeam, t: Math.round(durationS * 0.4) }],
  };
}
