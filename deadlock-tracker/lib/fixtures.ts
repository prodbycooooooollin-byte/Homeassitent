import { linearToBadge } from "./ranks";
import { DETAILS_VERSION, type HistoryEntry, type MatchDetails, type MatchPlayer, type TeamId } from "./types";
import type { ActiveMatchDto, BuildDto, HeroMeta, LeaderboardRow, MateRow, MatchupRow, SteamProfile } from "./api/deadlock-api";

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
  // Alle 20 Minuten läuft für 6 Minuten ein Demo-Match (DEADLOCK_DEMO_LIVE=1: dauerhaft).
  const phase = process.env.DEADLOCK_DEMO_LIVE === "1" ? 3 : Math.floor(now / 60000) % 20;
  if (phase >= 6) return null;
  const r = rng(Math.floor(now / 1200000));
  return {
    matchId: 79999999, startTime: Math.floor(now / 1000) - (phase * 60 + 840), durationS: phase * 60 + 840, mode: "Ranked",
    netWorth: [118400, 104200], objectives: [1, 2],
    players: Array.from({ length: 12 }, (_, i) => ({ accountId: i === 0 ? accountId : 810000 + i, heroId: 1 + Math.floor(r() * DEMO_HEROES.length), team: (i < 6 ? 0 : 1) as 0 | 1 })),
  };
}

export function demoHeroMeta(): HeroMeta[] {
  return DEMO_HEROES.map((h) => { const r = rng(h.id * 31); const matches = Math.round(2000 + r() * 18000); return { heroId: h.id, matches, wins: Math.round(matches * (0.44 + r() * 0.12)) }; });
}

export function demoLeaderboard(heroId?: number): LeaderboardRow[] {
  const r = rng(7 + (heroId ?? 0));
  return Array.from({ length: 100 }, (_, i) => ({
    place: i + 1, name: `${NAMES[i % NAMES.length]}${(i * 37) % 99}`,
    badge: i < 12 ? 116 : i < 40 ? 115 : i < 70 ? 114 : 113,
    heroIds: heroId ? [heroId] : [1 + Math.floor(r() * 20), 1 + Math.floor(r() * 20), 1 + Math.floor(r() * 20)],
    accountIds: [900000 + i],
  }));
}

export function demoMates(kind: "mates" | "enemies" | "party"): MateRow[] {
  const r = rng(kind === "enemies" ? 5 : 3);
  return Array.from({ length: kind === "party" ? 4 : 14 }, (_, i) => {
    const games = Math.round((kind === "party" ? 40 : 60) / (i + 1.4)) + 2;
    return { accountId: 600000 + i, games, wins: Math.round(games * (0.35 + r() * 0.4)), matchIds: Array.from({ length: Math.min(games, 8) }, (_, k) => 70000000 + k * 2 + i) };
  });
}

export function demoBuilds(heroId: number): BuildDto[] {
  const r = rng(heroId * 13);
  return ["Standard-Build", "Burst-Meta", "Sustain"].map((name, i) => ({
    id: 100000 + heroId * 10 + i, name: `${name}`, description: "Beliebter Build der Community.", authorId: 400000 + i, favorites: 900 - i * 220 + Math.round(r() * 80), weeklyFavorites: 160 - i * 40,
    updated: Math.floor(Date.now() / 1000) - i * 86400 * 3,
    categories: [["Early Game", 3], ["Mid Game", 4], ["Late Game", 4]].map(([n, c]) => ({ name: n as string, itemIds: Array.from({ length: c as number }, () => 1000 + Math.floor(r() * 24)) })),
  }));
}

export function demoTopItems(heroId: number): { itemId: number; builds: number }[] {
  const r = rng(heroId * 17);
  return Array.from({ length: 12 }, (_, i) => ({ itemId: 1000 + ((i * 5 + heroId) % 24), builds: Math.round(900 / (i + 1) + r() * 30) }));
}

export function demoMatchups(heroId: number): MatchupRow[] {
  const r = rng(heroId * 19);
  return DEMO_HEROES.filter((h) => h.id !== heroId).map((h) => { const matches = Math.round(600 + r() * 2400); return { heroId: h.id, matches, wins: Math.round(matches * (0.4 + r() * 0.2)) }; });
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
      rankedDelta: (d.winningTeam === me.team ? 1 : -1) * (d.winningTeam === me.team ? 190 + ((i * 37) % 70) : 150 + ((i * 53) % 60)),
    });
  }
  return out;
}

function shots(r: () => number, mins: number, skill: number) {
  const total = Math.round(mins * (180 + r() * 90));
  const acc = Math.min(0.55, 0.22 + (skill - 0.6) * 0.1 + r() * 0.08);
  const hit = Math.round(total * acc), heroHits = Math.round(hit * (0.55 + r() * 0.2));
  return { shotsHit: hit, shotsMissed: total - hit, heroHits, heroCrits: Math.round(heroHits * (0.1 + r() * 0.12)) };
}

export const DEMO_ITEMS = ["Schnellfeuer", "Pufferladung", "Lebensfunke", "Dolch des Schattens", "Glaskanone", "Seelenanker", "Pulsschild", "Zeitriss", "Aderlass", "Eisenhaut", "Nebelschritt", "Sturmherz",
  "Kristallkern", "Rachenspiegel", "Blutmond", "Wächterglas", "Phantomklinge", "Funkenschlag", "Obsidianpanzer", "Gnadenstoß", "Wanderstab", "Sirenengesang", "Titanfaust", "Echoschuss"];

/** Soul-Quellen für die Demo: der erste Spieler (du) farmt auffällig wenig im Jungle und stirbt oft allein. */
function soulParts(r: () => number, nw: number, mins: number, weakJungle: boolean) {
  const neutralShare = weakJungle ? 0.1 : 0.2 + r() * 0.1;
  const lane = nw * (weakJungle ? 0.42 : 0.3 + r() * 0.08), neutral = nw * neutralShare, boss = nw * (0.03 + r() * 0.05), treasure = nw * (0.04 + r() * 0.04), denied = nw * 0.015;
  const kills = Math.max(0, nw - lane - neutral - boss - treasure - denied);
  const laneKills = Math.round(mins * (weakJungle ? 5.2 : 6 + r() * 1.5));
  return {
    souls: { kills: Math.round(kills), lane: Math.round(lane), neutral: Math.round(neutral), boss: Math.round(boss), treasure: Math.round(treasure), denied: Math.round(denied), lost: Math.round(nw * 0.04) },
    creeps: { lane: laneKills, possible: Math.round(mins * 8.6), neutral: Math.round(neutral / 105) },
  };
}

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
      ...shots(r, mins, skill),
      ...soulParts(r, netWorth, mins, s === 0),
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
    v: DETAILS_VERSION, matchId, startTime, durationS, winningTeam, matchMode: "Ranked", gameMode: "1",
    avgBadge: [avg(0), avg(1)], players, objectives, midBoss: [{ team: winningTeam, t: Math.round(durationS * 0.4) }],
  };
}

/** Demo-Historien mit unterschiedlichem Profil je Spieler (Neuling, aggressiv, Smurf, Veteran …). */
export function demoScoutHistory(accountId: number): HistoryEntry[] {
  const base = demoHistory(accountId);
  const v = accountId % 12;
  const r = rng(accountId * 31);
  const count = [0, 4, 30, 30, 22, 30, 30, 18, 30, 30, 12, 30][v];
  const aggr = [1, 1, 1.7, 0.6, 1, 1.2, 0.8, 1, 1.9, 1, 1, 0.7][v];
  const winBias = [0.5, 0.5, 0.5, 0.4, 0.78, 0.5, 0.35, 0.5, 0.5, 0.6, 0.5, 0.5][v];
  return base.slice(0, count).map((m, i) => ({
    ...m, accountId, heroId: v === 5 && i % 3 === 0 ? 3 : m.heroId, won: r() < winBias,
    kills: Math.round(m.kills * aggr), deaths: Math.max(0, Math.round(m.deaths * (v === 3 ? 0.5 : aggr))), assists: Math.round(m.assists * (v === 11 ? 1.8 : 1)),
  }));
}
export const demoRanks = (ids: number[]) => new Map(ids.map((id) => [id, 40 + ((id * 7) % 5) * 10 + 1 + (id % 6)] as const));
